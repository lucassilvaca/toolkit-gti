//! Assinatura de requisições da LAN (HMAC-SHA256) — o segredo NUNCA trafega.
//!
//! SEGURANÇA (H2): antes, o `TOOLKIT_GTI_SECRET` era enviado verbatim no
//! header `x-toolkit-auth` de toda requisição HTTP interna da LAN
//! (`/invite`, `/reply`, `/whoami`, `/invite/validate`). Qualquer sniffer
//! passivo na rede capturava o segredo e passava a se autenticar como técnico.
//!
//! Agora o segredo é usado apenas como CHAVE de um HMAC. O cliente assina cada
//! requisição com `HMAC-SHA256(segredo, ts \n nonce \n operação \n sha256(body))`
//! e envia somente `ts`, `nonce` e a assinatura. O servidor recalcula com o
//! mesmo segredo e compara em tempo constante. Como o segredo não vai na rede:
//!
//! - **Sniffing**: capturar o tráfego não revela mais o segredo.
//! - **Adulteração**: o `sha256(body)` entra na assinatura — trocar o corpo
//!   invalida o MAC.
//! - **Replay**: o `ts` limita a janela (`MAX_SKEW_SECS`) e o `nonce` de uso
//!   único (ver `NonceCache`, no servidor) barra a reapresentação dentro dela.
//!
//! Este módulo é PURO (só `std` + `hmac`/`sha2`/`uuid`, sem Tauri nem `crate::`)
//! para ser incluído via `#[path]` em `tests/net_auth.rs` sem linkar o binário
//! do lib do Tauri — que não carrega no Windows (cdylib/staticlib →
//! STATUS_ENTRYPOINT_NOT_FOUND). Mesma técnica de `net_guard.rs`.

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

/// Headers HTTP que transportam a prova de autenticação (nunca o segredo).
pub const TS_HEADER: &str = "x-toolkit-ts";
pub const NONCE_HEADER: &str = "x-toolkit-nonce";
pub const SIG_HEADER: &str = "x-toolkit-sig";

/// Janela máxima (segundos) de defasagem tolerada entre o relógio do cliente e
/// o do servidor. Requisições fora disso são rejeitadas — limita a janela de
/// replay a este valor (o `NonceCache` fecha o replay dentro dela).
pub const MAX_SKEW_SECS: u64 = 60;

/// Rótulos de operação — assados na assinatura, precisam bater exatamente entre
/// cliente e servidor. Impede que uma assinatura de `/whoami` seja reusada num
/// `/invite`, por exemplo.
pub const OP_INVITE: &str = "invite";
pub const OP_INVITE_VALIDATE: &str = "invite_validate";
pub const OP_REPLY: &str = "reply";
pub const OP_WHOAMI: &str = "whoami";

type HmacSha256 = Hmac<Sha256>;

fn to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(s, "{:02x}", b);
    }
    s
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    to_hex(&h.finalize())
}

/// String canônica assinada. Qualquer divergência (ts, nonce, operação ou
/// corpo) muda o MAC.
fn canonical(ts: &str, nonce: &str, op: &str, body: &[u8]) -> String {
    format!("{ts}\n{nonce}\n{op}\n{}", sha256_hex(body))
}

/// Comparação em tempo constante (não retorna cedo na primeira divergência de
/// byte) — mesma defesa de timing do `net_guard::constant_time_eq`.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Um nonce bem-formado: hexadecimal/base tamanho razoável, só ASCII seguro.
/// Barra lixo antes de tocar no HMAC e limita o que entra no `NonceCache`.
fn nonce_is_wellformed(nonce: &str) -> bool {
    (16..=128).contains(&nonce.len())
        && nonce
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
}

/// Assina uma requisição; devolve o MAC em hex.
///
/// Segredo vazio → assinatura vazia (fail-closed: `verify` também trata segredo
/// vazio como inválido, então nada autentica sem provisionamento — H2).
pub fn sign(secret: &str, ts: &str, nonce: &str, op: &str, body: &[u8]) -> String {
    if secret.is_empty() {
        return String::new();
    }
    // `new_from_slice` aceita chave de qualquer tamanho (HMAC faz o padding);
    // o erro é infalível na prática, mas tratamos sem panicar.
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return String::new(),
    };
    mac.update(canonical(ts, nonce, op, body).as_bytes());
    to_hex(&mac.finalize().into_bytes())
}

/// Veredito da verificação — distinguir "expirado" de "inválido" ajuda no log.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SigVerdict {
    Valid,
    Expired,
    Invalid,
}

/// Verifica a assinatura de uma requisição recebida.
///
/// NÃO cobre replay de nonce (isso é estado do servidor — ver `NonceCache`);
/// aqui validamos apenas forma, janela de tempo e o MAC. Fail-closed quando o
/// segredo não está provisionado (H2).
#[allow(clippy::too_many_arguments)]
pub fn verify(
    secret: &str,
    provided_sig: Option<&str>,
    ts_str: Option<&str>,
    nonce: Option<&str>,
    op: &str,
    body: &[u8],
    now: u64,
    max_skew: u64,
) -> SigVerdict {
    if secret.is_empty() {
        return SigVerdict::Invalid;
    }
    let (Some(sig), Some(ts_str), Some(nonce)) = (provided_sig, ts_str, nonce) else {
        return SigVerdict::Invalid;
    };
    if !nonce_is_wellformed(nonce) {
        return SigVerdict::Invalid;
    }
    let Ok(ts) = ts_str.trim().parse::<u64>() else {
        return SigVerdict::Invalid;
    };
    if now.abs_diff(ts) > max_skew {
        return SigVerdict::Expired;
    }
    let expected = sign(secret, ts_str, nonce, op, body);
    if !expected.is_empty() && constant_time_eq(expected.as_bytes(), sig.trim().as_bytes()) {
        SigVerdict::Valid
    } else {
        SigVerdict::Invalid
    }
}

/// Segundos desde a época Unix (relógio local).
pub fn now_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Nonce de uso único: UUID v4 em hex (32 caracteres, passa em `nonce_is_wellformed`).
pub fn gen_nonce() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// Cabeçalhos prontos para anexar a uma requisição assinada.
#[derive(Debug, Clone)]
pub struct SignedHeaders {
    pub ts: String,
    pub nonce: String,
    pub sig: String,
}

/// Assina com o relógio atual e um nonce novo — atalho usado pelos clientes
/// HTTP (`/invite`, `/reply`, `/whoami`, `/invite/validate`).
pub fn sign_now(secret: &str, op: &str, body: &[u8]) -> SignedHeaders {
    let ts = now_unix_secs().to_string();
    let nonce = gen_nonce();
    let sig = sign(secret, &ts, &nonce, op, body);
    SignedHeaders { ts, nonce, sig }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "segredo-de-teste";
    const NONCE: &str = "0123456789abcdef0123456789abcdef";

    #[test]
    fn valid_signature_round_trips() {
        let ts = "1000000000";
        let sig = sign(SECRET, ts, NONCE, OP_INVITE, b"{}");
        assert_eq!(
            verify(
                SECRET,
                Some(&sig),
                Some(ts),
                Some(NONCE),
                OP_INVITE,
                b"{}",
                1_000_000_000,
                MAX_SKEW_SECS
            ),
            SigVerdict::Valid
        );
    }

    #[test]
    fn wrong_operation_is_rejected() {
        // Assinatura de /whoami não vale para /invite (op faz parte do MAC).
        let ts = "1000000000";
        let sig = sign(SECRET, ts, NONCE, OP_WHOAMI, b"");
        assert_eq!(
            verify(
                SECRET,
                Some(&sig),
                Some(ts),
                Some(NONCE),
                OP_INVITE,
                b"",
                1_000_000_000,
                MAX_SKEW_SECS
            ),
            SigVerdict::Invalid
        );
    }

    #[test]
    fn stale_timestamp_is_expired() {
        let ts = "1000000000";
        let sig = sign(SECRET, ts, NONCE, OP_WHOAMI, b"");
        assert_eq!(
            verify(
                SECRET,
                Some(&sig),
                Some(ts),
                Some(NONCE),
                OP_WHOAMI,
                b"",
                1_000_000_000 + MAX_SKEW_SECS + 1,
                MAX_SKEW_SECS
            ),
            SigVerdict::Expired
        );
    }

    #[test]
    fn empty_secret_never_authenticates() {
        assert!(sign("", "1", NONCE, OP_WHOAMI, b"").is_empty());
        assert_eq!(
            verify(
                "",
                Some(""),
                Some("1"),
                Some(NONCE),
                OP_WHOAMI,
                b"",
                1,
                MAX_SKEW_SECS
            ),
            SigVerdict::Invalid
        );
    }

    #[test]
    fn missing_headers_are_invalid() {
        assert_eq!(
            verify(SECRET, None, None, None, OP_WHOAMI, b"", 1, MAX_SKEW_SECS),
            SigVerdict::Invalid
        );
    }

    #[test]
    fn malformed_nonce_is_rejected() {
        let ts = "1000000000";
        for nonce in [
            "curto",
            "nonce com espaco e tamanho suficiente",
            "../../etc/passwd/xx",
        ] {
            let sig = sign(SECRET, ts, nonce, OP_WHOAMI, b"");
            assert_eq!(
                verify(
                    SECRET,
                    Some(&sig),
                    Some(ts),
                    Some(nonce),
                    OP_WHOAMI,
                    b"",
                    1_000_000_000,
                    MAX_SKEW_SECS
                ),
                SigVerdict::Invalid,
                "nonce deveria ser rejeitado: {nonce}"
            );
        }
    }

    #[test]
    fn sign_now_produces_verifiable_headers() {
        let signed = sign_now(SECRET, OP_REPLY, b"corpo");
        let now: u64 = signed.ts.parse().unwrap();
        assert_eq!(
            verify(
                SECRET,
                Some(&signed.sig),
                Some(&signed.ts),
                Some(&signed.nonce),
                OP_REPLY,
                b"corpo",
                now,
                MAX_SKEW_SECS
            ),
            SigVerdict::Valid
        );
    }
}
