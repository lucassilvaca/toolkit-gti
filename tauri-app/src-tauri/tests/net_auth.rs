//! Testes da assinatura HMAC das requisições da LAN (H2).
//!
//! `infra/net_auth.rs` é puro (só `std` + `hmac`/`sha2`/`uuid`), então é
//! incluído via `#[path]` — mesma técnica de `tests/security.rs` — sem linkar o
//! lib do Tauri, que não carrega como binário de teste no Windows.

#[path = "../src/infra/net_auth.rs"]
#[allow(dead_code)]
mod net_auth;

use net_auth::*;

const SECRET: &str = "segredo-compartilhado-da-lan";

fn verify_at(signed: &SignedHeaders, op: &str, body: &[u8], now: u64) -> SigVerdict {
    verify(
        SECRET,
        Some(&signed.sig),
        Some(&signed.ts),
        Some(&signed.nonce),
        op,
        body,
        now,
        MAX_SKEW_SECS,
    )
}

#[test]
fn valid_signature_is_accepted() {
    let body = br#"{"room_id":"abc"}"#;
    let signed = sign_now(SECRET, OP_INVITE, body);
    let now: u64 = signed.ts.parse().unwrap();
    assert_eq!(verify_at(&signed, OP_INVITE, body, now), SigVerdict::Valid);
}

#[test]
fn the_secret_never_needs_to_travel() {
    // Nenhum dos cabeçalhos enviados contém o segredo.
    let signed = sign_now(SECRET, OP_WHOAMI, b"");
    for header in [&signed.ts, &signed.nonce, &signed.sig] {
        assert!(!header.contains(SECRET));
    }
    assert_eq!(signed.sig.len(), 64, "HMAC-SHA256 em hex");
}

#[test]
fn tampered_body_breaks_the_mac() {
    let signed = sign_now(SECRET, OP_REPLY, br#"{"reply_message":"ok"}"#);
    let now: u64 = signed.ts.parse().unwrap();
    assert_eq!(
        verify_at(
            &signed,
            OP_REPLY,
            br#"{"reply_message":"clique aqui"}"#,
            now
        ),
        SigVerdict::Invalid
    );
}

#[test]
fn wrong_secret_is_rejected() {
    let signed = sign_now("outro-segredo", OP_INVITE, b"{}");
    let now: u64 = signed.ts.parse().unwrap();
    assert_eq!(
        verify_at(&signed, OP_INVITE, b"{}", now),
        SigVerdict::Invalid
    );
}

#[test]
fn replayed_stale_request_expires() {
    let ts = "1700000000";
    let nonce = gen_nonce();
    let sig = sign(SECRET, ts, &nonce, OP_INVITE, b"{}");
    let later = 1_700_000_000 + MAX_SKEW_SECS + 30;
    assert_eq!(
        verify(
            SECRET,
            Some(&sig),
            Some(ts),
            Some(&nonce),
            OP_INVITE,
            b"{}",
            later,
            MAX_SKEW_SECS
        ),
        SigVerdict::Expired
    );
}

#[test]
fn nonces_are_unique() {
    assert_ne!(gen_nonce(), gen_nonce());
}

#[test]
fn sign_now_is_self_consistent() {
    let signed = sign_now(SECRET, OP_INVITE_VALIDATE, b"payload");
    let now = now_unix_secs();
    assert_eq!(
        verify_at(&signed, OP_INVITE_VALIDATE, b"payload", now),
        SigVerdict::Valid
    );
}
