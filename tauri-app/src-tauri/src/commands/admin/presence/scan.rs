//! Descoberta de usuários online na LAN (Opção A: varredura sob demanda).
//!
//! Varre a VLAN do técnico (máscara real do adaptador) e as faixas extras de
//! Configurações (`networks.rs`), disparando GETs autenticados em `/whoami`.
//! Só as máquinas que rodam o Toolkit respondem — as demais dão timeout.
//! Nas VLANs remotas só a porta do chat é usada, então funcionam desde que o
//! roteamento/ACL entre VLANs libere essa porta nos dois sentidos.
//!
//! Além dos usuários online agora, mantém um cache de "visto por último": as
//! máquinas vistas recentemente (mas offline no momento) voltam na lista
//! marcadas como `online: false`.

use super::cache::{load_cache, now_secs, remember_probes, save_cache};
use super::networks::{build_scan_plan, load_networks, ScanTarget};
use super::probe::{build_client, probe_host, scan_targets};
use super::types::{OnlineUser, ScanResult};
use crate::commands::session::require_valid_session;
use crate::error_handling::{ApiError, ApiResult};
use crate::infra::named_pipe::shared_secret;
use crate::session::SessionsState;
use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr};
use std::time::Duration;
use tauri::{AppHandle, State};

/// Evento de progresso da varredura completa (`{done,total}`).
pub const SCAN_PROGRESS_EVENT: &str = "presence-scan-progress";

/// Online primeiro; depois máquinas com Toolkit; por fim por hostname e IP.
pub fn sort_users(users: &mut [OnlineUser]) {
    users.sort_by(|a, b| {
        b.online
            .cmp(&a.online)
            .then_with(|| b.has_toolkit.cmp(&a.has_toolkit))
            .then_with(|| a.hostname.to_lowercase().cmp(&b.hostname.to_lowercase()))
            .then_with(|| a.ip.cmp(&b.ip))
    });
}

#[tauri::command]
pub async fn scan_online_users(
    base_ip: String,
    ws_port: u16,
    app: AppHandle,
    sessions: State<'_, SessionsState>,
) -> ApiResult<ScanResult> {
    require_valid_session(&sessions).await?;

    // VLAN do técnico (máscara real do adaptador) + faixas extras configuradas
    // em Configurações. Ignora IPv6 e valores inválidos.
    if base_ip.contains(':') {
        return Err(
            ApiError::validation_error("base_ip").with_details("Varredura suporta apenas IPv4")
        );
    }
    let plan = match build_scan_plan(&base_ip, &load_networks()) {
        Some(plan) => plan,
        None => {
            return Ok(ScanResult {
                net: String::new(),
                probed: 0,
                users: vec![],
            })
        }
    };
    let net = plan.label;
    let mut targets = plan.targets;

    // Máquinas do histórico fora das faixas (outra VLAN/estado, "Conectar por
    // IP", a outra metade da /24) também são retestadas: sem isso ficavam presas
    // em "visto recentemente" mesmo depois de voltar.
    let planned: HashSet<Ipv4Addr> = targets.iter().map(|t| t.ip).collect();
    let own = base_ip.trim().parse::<Ipv4Addr>().ok();
    for ip in load_cache()
        .keys()
        .filter_map(|ip| ip.parse::<Ipv4Addr>().ok())
    {
        if !planned.contains(&ip) && Some(ip) != own {
            targets.push(ScanTarget { ip, remote: true });
        }
    }

    let (probed, probes) = scan_targets(targets, ws_port, &app, SCAN_PROGRESS_EVENT).await?;

    // Atualiza o cache de "visto por último" com quem respondeu agora. Só
    // máquinas identificáveis (Toolkit ou usuário via SMB) entram; hosts
    // anônimos (só IP) não vão para o histórico.
    let now = now_secs();
    let mut cache = load_cache();
    let online_ips: HashSet<String> = probes.iter().map(|p| p.ip.clone()).collect();
    remember_probes(&mut cache, &probes, now);
    save_cache(&cache);

    // Monta a lista: online agora + vistos recentemente (offline), sem duplicar.
    let mut users: Vec<OnlineUser> = probes
        .into_iter()
        .map(|p| p.into_online_user(now))
        .collect();

    for (ip, entry) in cache.iter() {
        if online_ips.contains(ip) {
            continue; // já está na lista como online
        }
        users.push(OnlineUser {
            ip: ip.clone(),
            hostname: entry.hostname.clone(),
            username: entry.username.clone(),
            online: false,
            has_toolkit: entry.has_toolkit,
            uptime_secs: None,
            last_seen: Some(entry.last_seen),
        });
    }

    sort_users(&mut users);

    Ok(ScanResult { net, probed, users })
}

/// Nome inexistente pode segurar o resolvedor do Windows por vários segundos.
const DNS_TIMEOUT: Duration = Duration::from_secs(3);

/// Nome de máquina aceitável para o DNS (rótulos alfanuméricos com `-`/`_`).
fn is_valid_hostname(host: &str) -> bool {
    host.len() <= 253
        && host.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && label
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        })
}

/// IPv4 digitado ou, se for nome de máquina, o primeiro IPv4 que o DNS devolver.
async fn resolve_target(target: &str) -> ApiResult<Ipv4Addr> {
    if let Ok(ip) = target.parse::<Ipv4Addr>() {
        return Ok(ip);
    }
    // Só dígitos e pontos é IP mal digitado: o getaddrinfo aceitaria "10.1.2"
    // como 10.1.0.2 e sondaria outra máquina.
    if target.chars().all(|c| c.is_ascii_digit() || c == '.') || !is_valid_hostname(target) {
        return Err(ApiError::validation_error("ip")
            .with_details("Informe um IPv4 ou nome de máquina, ex.: 10.20.30.40 ou PC-1234"));
    }
    let not_found = || {
        ApiError::not_found("Host").with_details(&format!(
            "{target} não está no DNS — confira o nome ou use o IP"
        ))
    };
    let addrs = match tokio::time::timeout(DNS_TIMEOUT, tokio::net::lookup_host((target, 0))).await
    {
        Ok(Ok(addrs)) => addrs,
        _ => return Err(not_found()),
    };
    addrs
        .filter_map(|a| match a.ip() {
            IpAddr::V4(v4) => Some(v4),
            IpAddr::V6(_) => None,
        })
        .next()
        .ok_or_else(not_found)
}

/// Sonda **uma** máquina específica (IP ou nome informado pelo técnico),
/// inclusive fora da /24 local — desde que o roteamento permita alcançá-la.
/// Retorna a máquina se estiver ligada, ou `None` se não respondeu
/// (desligada/bloqueada/inalcançável).
#[tauri::command]
pub async fn probe_host_by_ip(
    ip: String,
    ws_port: u16,
    sessions: State<'_, SessionsState>,
) -> ApiResult<Option<OnlineUser>> {
    require_valid_session(&sessions).await?;

    let target = ip.trim();
    let addr = resolve_target(target).await?;
    let by_name = target.parse::<Ipv4Addr>().is_err();

    let client = build_client()?;
    let secret = shared_secret();
    let now = now_secs();

    let Some(mut probe) = probe_host(addr.to_string(), ws_port, client, secret).await else {
        return Ok(None);
    };
    // Sem Toolkit nem SMB a sonda não sabe o nome; o técnico acabou de digitá-lo.
    if by_name && probe.hostname.is_empty() {
        probe.hostname = target.to_uppercase();
    }
    // Entra no histórico: depois de reiniciar o app a máquina continua na
    // lista ("visto recentemente") e a busca por login a acha sem varrer.
    let mut cache = load_cache();
    remember_probes(&mut cache, std::slice::from_ref(&probe), now);
    save_cache(&cache);
    Ok(Some(probe.into_online_user(now)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user(ip: &str, host: &str, online: bool, toolkit: bool) -> OnlineUser {
        OnlineUser {
            ip: ip.into(),
            hostname: host.into(),
            username: String::new(),
            online,
            has_toolkit: toolkit,
            uptime_secs: None,
            last_seen: None,
        }
    }

    #[test]
    fn ordena_online_depois_toolkit_depois_hostname() {
        let mut users = vec![
            user("10.0.0.4", "PC-D", false, true),
            user("10.0.0.3", "", true, false),
            user("10.0.0.2", "PC-B", true, true),
            user("10.0.0.1", "PC-A", true, true),
        ];
        sort_users(&mut users);
        let ordem: Vec<&str> = users.iter().map(|u| u.ip.as_str()).collect();
        assert_eq!(ordem, ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"]);
    }

    #[test]
    fn valida_nome_de_maquina() {
        assert!(is_valid_hostname("PC-1234"));
        assert!(is_valid_hostname("pc0101.empresa.local"));
        assert!(!is_valid_hostname("pc com espaco"));
        assert!(!is_valid_hostname("-pc"));
        assert!(!is_valid_hostname("pc..empresa"));
        assert!(!is_valid_hostname("pc;calc"));
    }

    #[tokio::test]
    async fn resolve_ip_direto_e_recusa_ip_incompleto() {
        assert_eq!(
            resolve_target("10.20.30.40").await.ok(),
            Some(Ipv4Addr::new(10, 20, 30, 40))
        );
        assert_eq!(
            resolve_target("localhost").await.ok(),
            Some(Ipv4Addr::LOCALHOST)
        );
        assert!(resolve_target("10.1.2").await.is_err());
        assert!(resolve_target("pc com espaco").await.is_err());
    }
}
