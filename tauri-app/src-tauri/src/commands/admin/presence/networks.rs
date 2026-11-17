//! Faixas extras para a varredura de usuários online (multi-VLAN), persistidas
//! em `~/.toolkit_gti/presence_networks.json`, e o plano de varredura que junta
//! a VLAN do técnico com essas faixas.
//!
//! Formato salvo: lista de CIDR canônico (`"10.20.31.0/24"`). Listas antigas no
//! formato `"A.B.C"` continuam válidas (lidas como /24).
//!
//! VLAN do técnico: varredura completa (ping/TCP + `/whoami`, plano B por SMB).
//! VLANs remotas: `/whoami` direto na porta do chat e, sem resposta, plano B
//! por SMB (445) — acha quem está logado mesmo com a porta do chat bloqueada
//! entre os estados (aí aparece "sem toolkit", sem chat).

use super::matching::{parse_range, Ipv4Range};
use crate::commands::session::require_valid_session;
use crate::domain::system::local_prefix_len;
use crate::error_handling::{ApiError, ApiResult};
use crate::session::SessionsState;
use std::collections::HashSet;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use tauri::State;

/// Soma máxima de hosts das faixas extras (≈ 16 VLANs /24). Com a
/// concorrência de `probe::MAX_CONCURRENT_PROBES`, a varredura fica em ~30 s.
pub const MAX_EXTRA_HOSTS: u32 = 4096;

/// Um IP a sondar e o modo de sondagem.
#[derive(Debug, Clone, Copy)]
pub struct ScanTarget {
    pub ip: Ipv4Addr,
    /// `true` fora da VLAN do técnico: `/whoami` direto e plano B por SMB,
    /// sem ping/TCP de presença (`probe::probe_remote`).
    pub remote: bool,
}

/// O que varrer numa rodada: rótulo para a UI e a lista de alvos.
#[derive(Debug, Clone)]
pub struct ScanPlan {
    /// Ex.: `"10.20.30.128/25 + 10.20.31.0/24"`.
    pub label: String,
    pub targets: Vec<ScanTarget>,
}

fn networks_path() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(|home| {
        PathBuf::from(home)
            .join(".toolkit_gti")
            .join("presence_networks.json")
    })
}

/// Deduplica (mantendo a ordem) e corta no orçamento de hosts.
fn within_budget(ranges: impl IntoIterator<Item = Ipv4Range>) -> Vec<Ipv4Range> {
    let mut out: Vec<Ipv4Range> = Vec::new();
    let mut hosts = 0u32;
    for range in ranges {
        if out.contains(&range) || hosts + range.host_count() > MAX_EXTRA_HOSTS {
            continue;
        }
        hosts += range.host_count();
        out.push(range);
    }
    out
}

/// Valida o que o técnico digitou. Erro lista as entradas inválidas ou avisa
/// que o total passou do orçamento — nada é descartado em silêncio.
fn validate_networks(raw: &[String]) -> Result<Vec<Ipv4Range>, String> {
    let entries: Vec<&str> = raw
        .iter()
        .map(|e| e.trim())
        .filter(|e| !e.is_empty())
        .collect();
    let invalid: Vec<&str> = entries
        .iter()
        .copied()
        .filter(|e| parse_range(e).is_none())
        .collect();
    if !invalid.is_empty() {
        return Err(format!(
            "Faixas inválidas: {}. Use CIDR, ex.: 10.20.31.0/24 (prefixo de /20 a /30).",
            invalid.join(", ")
        ));
    }
    let mut ranges: Vec<Ipv4Range> = Vec::new();
    for range in entries.iter().filter_map(|e| parse_range(e)) {
        if !ranges.contains(&range) {
            ranges.push(range);
        }
    }
    let total: u32 = ranges.iter().map(Ipv4Range::host_count).sum();
    if total > MAX_EXTRA_HOSTS {
        return Err(format!(
            "As faixas somam {total} hosts; o limite é {MAX_EXTRA_HOSTS} (≈ 16 redes /24)."
        ));
    }
    Ok(ranges)
}

/// Faixas salvas. Arquivo ausente/corrompido = nenhuma faixa extra.
pub fn load_networks() -> Vec<Ipv4Range> {
    let saved: Vec<String> = networks_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    within_budget(saved.iter().filter_map(|e| parse_range(e)))
}

/// Junta a VLAN do técnico (máscara real do adaptador) com as faixas extras,
/// sem repetir IP e sem incluir o próprio técnico. `None` se `base_ip` não for
/// IPv4.
pub fn build_scan_plan(base_ip: &str, extra: &[Ipv4Range]) -> Option<ScanPlan> {
    let own: Ipv4Addr = base_ip.trim().parse().ok()?;
    let local = Ipv4Range::local(own, local_prefix_len(own));
    Some(plan_for(own, local, extra))
}

/// Parte pura de `build_scan_plan` (testável sem a API do Windows).
fn plan_for(own: Ipv4Addr, local: Ipv4Range, extra: &[Ipv4Range]) -> ScanPlan {
    let mut seen: HashSet<Ipv4Addr> = HashSet::from([own]);
    let mut targets = Vec::new();
    let mut labels = vec![local.to_cidr()];

    for ip in local.hosts() {
        if seen.insert(ip) {
            targets.push(ScanTarget { ip, remote: false });
        }
    }
    for range in extra {
        let before = targets.len();
        for ip in range.hosts() {
            if seen.insert(ip) {
                targets.push(ScanTarget {
                    ip,
                    remote: !local.contains(ip),
                });
            }
        }
        if targets.len() > before {
            labels.push(range.to_cidr());
        }
    }

    ScanPlan {
        label: labels.join(" + "),
        targets,
    }
}

#[tauri::command]
pub async fn get_scan_networks(sessions: State<'_, SessionsState>) -> ApiResult<Vec<String>> {
    require_valid_session(&sessions).await?;
    Ok(load_networks().iter().map(Ipv4Range::to_cidr).collect())
}

#[tauri::command]
pub async fn set_scan_networks(
    networks: Vec<String>,
    sessions: State<'_, SessionsState>,
) -> ApiResult<Vec<String>> {
    require_valid_session(&sessions).await?;
    let cleaned: Vec<String> = validate_networks(&networks)
        .map_err(|e| ApiError::validation_error("networks").with_details(&e))?
        .iter()
        .map(Ipv4Range::to_cidr)
        .collect();
    let path = networks_path()
        .ok_or_else(|| ApiError::internal_error().with_details("USERPROFILE não encontrado"))?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(ApiError::from)?;
    }
    let json = serde_json::to_string_pretty(&cleaned)
        .map_err(|e| ApiError::internal_error().with_details(&e.to_string()))?;
    std::fs::write(&path, json).map_err(ApiError::from)?;
    Ok(cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn valida_normaliza_e_deduplica() {
        let input = strings(&["10.20.31", " 10.20.31.0/24 ", "", "10.20.32.0/25"]);
        let ok = validate_networks(&input).unwrap();
        let cidrs: Vec<String> = ok.iter().map(Ipv4Range::to_cidr).collect();
        assert_eq!(cidrs, ["10.20.31.0/24", "10.20.32.0/25"]);
    }

    #[test]
    fn rejeita_invalidas_e_excesso_de_hosts() {
        let input = strings(&["10.20.31.0/24", "lixo", "10.0.0.0/8"]);
        let err = validate_networks(&input).unwrap_err();
        assert!(err.contains("lixo") && err.contains("10.0.0.0/8"), "{err}");

        let many: Vec<String> = (0..20).map(|i| format!("10.97.{i}.0/24")).collect();
        assert!(validate_networks(&many).unwrap_err().contains("limite"));
    }

    #[test]
    fn plano_vlan_local_completa_e_remota_so_toolkit() {
        let own = Ipv4Addr::new(10, 20, 30, 145);
        let local = Ipv4Range::local(own, Some(25));
        let extra = [
            parse_range("10.20.31.0/30").unwrap(),
            // Sobreposta à VLAN local: não duplica nem vira "só Toolkit".
            parse_range("10.20.30.128/30").unwrap(),
        ];
        let plan = plan_for(own, local, &extra);

        assert_eq!(plan.label, "10.20.30.128/25 + 10.20.31.0/30");
        assert_eq!(
            plan.targets.len(),
            125 + 2,
            "126 hosts locais menos o técnico + 2 remotos"
        );
        assert!(!plan.targets.iter().any(|t| t.ip == own));
        let remote: Vec<_> = plan.targets.iter().filter(|t| t.remote).collect();
        assert_eq!(remote.len(), 2);
        assert!(remote.iter().all(|t| t.ip.octets()[2] == 31));
    }
}
