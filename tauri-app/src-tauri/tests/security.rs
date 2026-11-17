//! Testes de integração das defesas de rede críticas.
//!
//! O binário de unit-test do lib Tauri não carrega no Windows (crate-type
//! cdylib/staticlib → STATUS_ENTRYPOINT_NOT_FOUND), então `cargo test --lib`
//! e qualquer teste que linke o crate falham. Para rodar as garantias de
//! segurança de forma confiável no CI, incluímos o módulo PURO `net_guard`
//! diretamente via `#[path]` — ele só usa `std`, então este binário de teste
//! não linka o Tauri e carrega normalmente (mesma técnica de `auth_logic.rs`).
//!
//! Cobre:
//! - `validate_host_target` → anti command-injection (ping/tracert/nslookup)
//! - `is_lan_ip`            → anti-SSRF no callback de convite (A1)
//! - `sanitize_log_label`   → anti log-injection nos rótulos vindos do frontend
//! - `shared_secret`        → fallback para o segredo default da LAN (decisão de produto)
//!
//! A autenticação da LAN por assinatura HMAC é coberta em `tests/net_auth.rs`.

#[path = "../src/infra/net_guard.rs"]
#[allow(dead_code)]
mod net_guard;

use net_guard::{is_lan_ip, sanitize_log_label, shared_secret, validate_host_target};

#[test]
fn host_target_accepts_valid_hosts() {
    for host in [
        "8.8.8.8",
        "google.com",
        "host-name_01.sub.local",
        "2001:db8::1",
        "10.0.0.1",
    ] {
        assert!(
            validate_host_target(host).is_ok(),
            "deveria aceitar: {host}"
        );
    }
}

#[test]
fn host_target_blocks_command_injection() {
    for payload in [
        "8.8.8.8 & whoami",
        "8.8.8.8 && calc",
        "8.8.8.8 | dir",
        "8.8.8.8 ^& echo",
        "8.8.8.8 > out.txt",
        "%USERNAME%",
        "a!DELAYED!",
        "$(whoami)",
        "host`whoami`",
        "a b",
    ] {
        assert!(
            validate_host_target(payload).is_err(),
            "deveria rejeitar: {payload}"
        );
    }
}

#[test]
fn host_target_rejects_empty_and_oversized() {
    assert!(validate_host_target("   ").is_err());
    assert!(validate_host_target(&"a".repeat(256)).is_err());
}

#[test]
fn lan_ip_accepts_private_loopback_and_ipv6_ula() {
    for ip in [
        "10.0.0.1",
        "192.168.1.50",
        "172.16.5.4",
        "127.0.0.1",
        "169.254.1.1",
        "::1",
        "fd00::1",
        "fe80::1",
    ] {
        assert!(is_lan_ip(ip), "deveria aceitar LAN: {ip}");
    }
}

#[test]
fn lan_ip_rejects_public_and_garbage() {
    for ip in [
        "8.8.8.8",
        "1.1.1.1",
        "172.32.0.1",
        "2001:db8::1",
        "evil.com",
        "",
        "not-an-ip",
    ] {
        assert!(!is_lan_ip(ip), "deveria rejeitar: {ip}");
    }
}

#[test]
fn shared_secret_falls_back_to_default_when_unset() {
    assert!(!shared_secret().trim().is_empty());
}

#[test]
fn log_label_cannot_forge_log_lines() {
    let out = sanitize_log_label("rdp\n[INFO] login ok");
    assert!(!out.contains('\n'));
    assert!(sanitize_log_label(&"a".repeat(500)).chars().count() <= 65);
}
