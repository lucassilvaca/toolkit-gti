//! Busca de uma pessoa pelo nome de login (ex.: `joao.silva`): descobre em
//! qual máquina ela está e se está online **agora**.
//!
//! Estratégia em duas fases, para responder rápido no caso comum:
//!
//! 1. **Histórico** — o cache de presença já sabe em quais IPs cada usuário foi
//!    visto. Resondamos só esses endereços (1-3 hosts, ~1s) e, se o nome ainda
//!    bate, respondemos sem varrer a rede.
//! 2. **Varredura** — se o histórico não resolveu (primeira busca, usuário
//!    trocou de máquina, cache expirado), varre a VLAN do técnico e as faixas
//!    extras de Configurações, filtrando pelo usuário logado que cada máquina
//!    reporta em `/whoami`.
//!
//! Quando nada responde, ainda devolvemos as máquinas do histórico marcadas
//! como offline — o técnico ao menos descobre **onde** a pessoa estava.

use super::cache::{load_cache, now_secs, remember_probes, save_cache};
use super::matching::{is_conclusive, match_kind, normalize_username, MatchKind};
use super::networks::{build_scan_plan, load_networks};
use super::probe::{probe_many, scan_targets, Probe};
use super::types::{OnlineUser, UserLookupResult};
use crate::commands::session::require_valid_session;
use crate::error_handling::{ApiError, ApiResult};
use crate::session::SessionsState;
use std::collections::HashSet;
use tauri::{AppHandle, State};

/// Evento de progresso da fase de varredura da busca (`{done,total}`).
pub const LOOKUP_PROGRESS_EVENT: &str = "presence-lookup-progress";

/// Mínimo de caracteres para buscar — abaixo disso a busca parcial casaria com
/// meia rede e a varredura seria desperdiçada.
const MIN_QUERY_LEN: usize = 2;

/// Máquina que casou com a busca, com o grau do match para ordenar depois.
struct Ranked {
    user: OnlineUser,
    kind: MatchKind,
}

/// Resultado mais útil primeiro: online antes de offline, match exato antes do
/// parcial, máquina com Toolkit antes das demais, depois hostname.
fn sort_ranked(ranked: &mut [Ranked]) {
    ranked.sort_by(|a, b| {
        b.user
            .online
            .cmp(&a.user.online)
            .then_with(|| a.kind.cmp(&b.kind))
            .then_with(|| b.user.has_toolkit.cmp(&a.user.has_toolkit))
            .then_with(|| {
                a.user
                    .hostname
                    .to_lowercase()
                    .cmp(&b.user.hostname.to_lowercase())
            })
            .then_with(|| a.user.ip.cmp(&b.user.ip))
    });
}

/// Filtra as sondas pelo nome buscado, já convertidas em linhas da tabela.
fn rank_probes(probes: Vec<Probe>, query: &str, now: u64) -> Vec<Ranked> {
    probes
        .into_iter()
        .filter_map(|p| {
            match_kind(query, &p.username).map(|kind| Ranked {
                user: p.into_online_user(now),
                kind,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn find_user_by_name(
    name: String,
    base_ip: String,
    ws_port: u16,
    app: AppHandle,
    sessions: State<'_, SessionsState>,
) -> ApiResult<UserLookupResult> {
    require_valid_session(&sessions).await?;

    let query = normalize_username(&name);
    if query.chars().count() < MIN_QUERY_LEN {
        return Err(ApiError::validation_error("name")
            .with_details("Informe ao menos 2 letras do usuário, ex.: joao.silva"));
    }

    let now = now_secs();
    let mut cache = load_cache();

    // ── Fase 1: histórico ────────────────────────────────────────────────────
    // Onde essa pessoa já foi vista? Resondar 1-3 IPs conhecidos é ordens de
    // magnitude mais barato que varrer 253 hosts.
    let conhecidos: Vec<String> = cache
        .iter()
        .filter(|(_, e)| match_kind(&query, &e.username).is_some())
        .map(|(ip, _)| ip.clone())
        .collect();

    let mut ranked: Vec<Ranked> = Vec::new();
    let mut probed: u16 = 0;

    if !conhecidos.is_empty() {
        probed = conhecidos.len().min(u16::MAX as usize) as u16;
        let probes = probe_many(conhecidos, ws_port).await?;

        // Quem respondeu tem o dado fresco — atualiza o histórico mesmo que o
        // usuário logado tenha mudado (a máquina pode ter trocado de dono).
        remember_probes(&mut cache, &probes, now);
        save_cache(&cache);

        ranked = rank_probes(probes, &query, now);
    }

    // ── Fase 2: varredura da sub-rede ────────────────────────────────────────
    // Só quando o histórico não deu uma resposta conclusiva — primeira busca,
    // troca de máquina, cache expirado ou acerto apenas parcial.
    let mut net = String::new();
    let mut scanned = false;

    if !ranked.iter().any(|r| is_conclusive(r.user.online, r.kind)) {
        if let Some(plan) = build_scan_plan(&base_ip, &load_networks()) {
            scanned = true;
            net = plan.label;
            let (hosts, probes) =
                scan_targets(plan.targets, ws_port, &app, LOOKUP_PROGRESS_EVENT).await?;
            probed = hosts;

            remember_probes(&mut cache, &probes, now);
            save_cache(&cache);

            // A varredura acabou de falar com cada host: onde os dois passos se
            // cruzam, o resultado dela substitui o do histórico.
            let novos = rank_probes(probes, &query, now);
            let ips_novos: HashSet<String> = novos.iter().map(|r| r.user.ip.clone()).collect();
            ranked.retain(|r| !ips_novos.contains(&r.user.ip));
            ranked.extend(novos);
        }
    }

    let confirmados: HashSet<String> = ranked.iter().map(|r| r.user.ip.clone()).collect();

    // ── Complemento: onde a pessoa esteve ────────────────────────────────────
    // Máquinas do histórico que não responderam entram como offline, para o
    // técnico saber o último lugar em que ela apareceu.
    for (ip, entry) in cache.iter() {
        if confirmados.contains(ip) {
            continue;
        }
        if let Some(kind) = match_kind(&query, &entry.username) {
            ranked.push(Ranked {
                user: OnlineUser {
                    ip: ip.clone(),
                    hostname: entry.hostname.clone(),
                    username: entry.username.clone(),
                    online: false,
                    has_toolkit: entry.has_toolkit,
                    uptime_secs: None,
                    last_seen: Some(entry.last_seen),
                },
                kind,
            });
        }
    }

    sort_ranked(&mut ranked);

    Ok(UserLookupResult {
        query,
        net,
        probed,
        scanned,
        matches: ranked.into_iter().map(|r| r.user).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ranked(ip: &str, host: &str, online: bool, kind: MatchKind) -> Ranked {
        Ranked {
            user: OnlineUser {
                ip: ip.into(),
                hostname: host.into(),
                username: "joao.silva".into(),
                online,
                has_toolkit: true,
                uptime_secs: None,
                last_seen: None,
            },
            kind,
        }
    }

    #[test]
    fn ordena_online_e_match_exato_primeiro() {
        let mut lista = vec![
            ranked("10.0.0.3", "PC-C", false, MatchKind::Exact),
            ranked("10.0.0.2", "PC-B", true, MatchKind::Partial),
            ranked("10.0.0.1", "PC-A", true, MatchKind::Exact),
        ];
        sort_ranked(&mut lista);
        let ordem: Vec<&str> = lista.iter().map(|r| r.user.ip.as_str()).collect();
        assert_eq!(ordem, ["10.0.0.1", "10.0.0.2", "10.0.0.3"]);
    }
}
