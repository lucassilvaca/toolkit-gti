//! Regras puras da presença (nome de login e rede), rodando sem linkar o lib
//! do Tauri — `commands/admin/presence/matching.rs` só usa `std`, então é
//! incluído via `#[path]` (mesma técnica de `tests/security.rs`).

#[path = "../src/commands/admin/presence/matching.rs"]
#[allow(dead_code)]
mod matching;

use matching::{
    identify_logons, is_conclusive, match_kind, normalize_username, parse_range, Ipv4Range,
    MatchKind,
};
use std::net::Ipv4Addr;

#[test]
fn login_com_dominio_casa_com_login_simples() {
    assert_eq!(normalize_username("EMPRESA\\joao.silva"), "joao.silva");
    assert_eq!(
        match_kind("Joao.Silva", "EMPRESA\\joao.silva"),
        Some(MatchKind::Exact)
    );
}

#[test]
fn busca_parcial_nao_e_conclusiva() {
    let kind = match_kind("joao", "joao.silva").unwrap();
    assert_eq!(kind, MatchKind::Partial);
    assert!(!is_conclusive(true, kind));
    assert!(is_conclusive(true, MatchKind::Exact));
    assert!(!is_conclusive(false, MatchKind::Exact));
}

#[test]
fn vlan_local_usa_o_prefixo_real_do_adaptador() {
    // Estação GTI real: 10.20.30.145/25 → VLAN 10.20.30.128/25 (não a /24).
    let ip = Ipv4Addr::new(10, 20, 30, 145);
    let vlan = Ipv4Range::local(ip, Some(25));
    assert_eq!(vlan.to_cidr(), "10.20.30.128/25");
    assert_eq!(vlan.host_count(), 126);

    // Sem prefixo (API falhou) cai no comportamento antigo: /24.
    assert_eq!(Ipv4Range::local(ip, None).to_cidr(), "10.20.30.0/24");
    // VLAN gigante (/16) é limitada ao bloco /22 em volta do técnico.
    assert_eq!(Ipv4Range::local(ip, Some(16)).to_cidr(), "10.20.28.0/22");
}

#[test]
fn faixas_configuradas_aceitam_cidr_e_formato_antigo() {
    let cidr = |s: &str| parse_range(s).map(|r| r.to_cidr());
    assert_eq!(cidr("10.20.31").as_deref(), Some("10.20.31.0/24"));
    assert_eq!(cidr("10.20.32.0/23").as_deref(), Some("10.20.32.0/23"));
    assert_eq!(cidr("10.20.33.130/26").as_deref(), Some("10.20.33.128/26"));
    assert_eq!(parse_range("10.0.0.0/16"), None, "faixa grande demais");
    assert_eq!(parse_range("10.20.30.1; calc"), None);
}

#[test]
fn smb_identifica_maquina_e_pessoa_logada() {
    // Saída real de NetWkstaUserEnum numa estação da rede (2026-10-29).
    let s = |d: &str, u: &str| (d.to_string(), u.to_string());
    let logado = [
        s("EMPRESA", "joao.silva"),
        s("EMPRESA", "joao.silva"),
        s("EMPRESA", "PC0102$"),
        s("Font Driver Host", "UMFD-0"),
    ];
    assert_eq!(
        identify_logons(&logado),
        ("PC0102".to_string(), "joao.silva".to_string())
    );

    // Tela de login: só a conta da máquina e sessões do Windows.
    let sem_pessoa = [s("EMPRESA", "PC0101$"), s("Window Manager", "DWM-1")];
    assert_eq!(
        identify_logons(&sem_pessoa),
        ("PC0101".to_string(), String::new())
    );
}
