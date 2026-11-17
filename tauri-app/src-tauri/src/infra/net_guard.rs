//! Defesas de rede puras — SEM dependências de Tauri, serde ou `crate::`.
//!
//! Isolar estas funções aqui tem dois motivos:
//! 1. **Testabilidade**: o binário de unit-test do lib Tauri não carrega no
//!    Windows (crate-type cdylib/staticlib → STATUS_ENTRYPOINT_NOT_FOUND).
//!    Como este arquivo só usa `std`, ele é incluído diretamente em
//!    `tests/security.rs` via `#[path]`, rodando sem linkar o Tauri.
//! 2. **Coesão**: lógica de segurança separada da cola de infraestrutura.

/// Nome da variável de ambiente que define o segredo compartilhado da LAN.
pub const SECRET_ENV_VAR: &str = "TOOLKIT_GTI_SECRET";

/// Segredo default — usado quando `TOOLKIT_GTI_SECRET` não está configurado.
///
/// DECISÃO DE PRODUTO: o endurecimento H2 que abortava o chat sem segredo
/// provisionado foi revertido de propósito. Com este fallback o chat funciona
/// out-of-the-box em qualquer máquina com o Toolkit; o custo é que o valor é
/// público (está no código), então qualquer um que o leia consegue falar com os
/// toolkits da LAN. Para endurecer, provisione a variável via MSI/GPO com um
/// valor próprio (o MESMO em todas as máquinas). Ver `secret_is_default()`.
const DEFAULT_SECRET: &str = "toolkit-gti-lan";

/// Segredo compartilhado entre as instâncias do toolkit na LAN — usado como
/// chave do HMAC que assina convites/pop-ups (`/invite`, `/reply`).
///
/// SEGURANÇA (A2): sem uma chave comum, máquinas aleatórias da rede não
/// conseguem forjar convites de chat nem pop-ups — mitiga phishing na LAN.
///
/// Quando `TOOLKIT_GTI_SECRET` não está definido, caímos no `DEFAULT_SECRET`
/// (ver decisão acima). O segredo nunca trafega: só a assinatura derivada dele
/// (ver `crate::infra::net_auth`).
pub fn shared_secret() -> String {
    std::env::var(SECRET_ENV_VAR)
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SECRET.to_string())
}

/// `true` quando o segredo em uso é o default público (variável não configurada).
/// Usado no startup para avisar o operador (mitigação parcial de H2/M3).
pub fn secret_is_default() -> bool {
    std::env::var(SECRET_ENV_VAR)
        .ok()
        .filter(|s| !s.trim().is_empty())
        .is_none()
}

/// Comparação de segredo em tempo constante (não retorna cedo na primeira
/// divergência de byte).
///
/// SEGURANÇA (H1): `==` de `str` faz `memcmp`, que vaza — via timing — o número
/// de bytes corretos no prefixo. Aqui percorremos todos os bytes sempre. O
/// tamanho ainda difere quando os comprimentos divergem, o que é aceitável.
///
/// O antigo `auth_header_matches` (segredo em claro no header `x-toolkit-auth`)
/// saiu com o H2: a autenticação da LAN agora é por assinatura HMAC
/// (`crate::infra::net_auth`).
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Tamanho máximo de um rótulo vindo do frontend ecoado em log/erro.
const MAX_LOG_LABEL_LEN: usize = 64;

/// Sanitiza um rótulo controlado pelo chamador (nome de tarefa, ação, etc.)
/// antes de ecoá-lo em log ou mensagem de erro.
///
/// SEGURANÇA (L1 — log injection): um `task` com `\n`/`\r` forjaria linhas
/// inteiras no log de auditoria, e um valor gigante incharia o arquivo. Só
/// passa a allowlist `[A-Za-z0-9_.:-]` (o resto vira `?`) e o resultado é
/// truncado em `MAX_LOG_LABEL_LEN` caracteres.
pub fn sanitize_log_label(input: &str) -> String {
    let mut out: String = input
        .chars()
        .take(MAX_LOG_LABEL_LEN)
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | ':' | '-') {
                c
            } else {
                '?'
            }
        })
        .collect();
    if input.chars().count() > MAX_LOG_LABEL_LEN {
        out.push('…');
    }
    out
}

/// Restringe um IP a redes privadas/loopback/link-local (IPv4 e IPv6).
///
/// SEGURANÇA (A1 — SSRF): o `admin_ip` de um convite só pode apontar para a
/// LAN, nunca para a internet ou endereços arbitrários. Bloqueia o uso do app
/// como sonda para hosts externos.
pub fn is_lan_ip(ip: &str) -> bool {
    use std::net::IpAddr;
    match ip.trim().parse::<IpAddr>() {
        Ok(IpAddr::V4(v4)) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        // IPv6: loopback (::1), ULA fc00::/7 (equivalente ao RFC 1918) e
        // link-local fe80::/10 (equivalente ao 169.254.x.x). Em redes dual-stack
        // corporativas a máquina admin pode ter um ULA como IP primário — sem
        // isto o convite de chat seria descartado (regressão M1).
        Ok(IpAddr::V6(v6)) => {
            v6.is_loopback()
                || (v6.segments()[0] & 0xfe00) == 0xfc00 // ULA fc00::/7
                || (v6.segments()[0] & 0xffc0) == 0xfe80 // link-local fe80::/10
        }
        Err(_) => false,
    }
}

/// Valida um host/IP/hostname antes de passá-lo a um comando de shell.
///
/// SEGURANÇA (command injection): comandos como `ping`/`tracert`/`nslookup` são
/// executados via `cmd /C`, que interpreta metacaracteres (`&`, `|`, `^`, `>`,
/// espaço, `%`, `!`) e permitiria injeção. Aceitamos apenas o conjunto válido
/// para IPv4, IPv6 e hostnames (RFC 1123): alfanuméricos ASCII, `.`, `-`, `_`
/// e `:`. Qualquer outra coisa é rejeitada.
pub fn validate_host_target(target: &str) -> Result<String, String> {
    let clean = target.trim();

    if clean.is_empty() {
        return Err("O destino nao pode ser vazio".to_string());
    }
    if clean.len() > 255 {
        return Err("Destino muito longo (maximo 255 caracteres)".to_string());
    }
    if !clean
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ':'))
    {
        return Err(
            "Destino invalido. Use apenas letras, numeros, ponto, hifen, underscore e dois-pontos"
                .to_string(),
        );
    }

    Ok(clean.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_host_target_accepts_valid_hosts() {
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
    fn validate_host_target_trims_whitespace() {
        assert_eq!(validate_host_target("  8.8.8.8  ").unwrap(), "8.8.8.8");
    }

    #[test]
    fn validate_host_target_blocks_command_injection() {
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
    fn validate_host_target_rejects_empty_and_oversized() {
        assert!(validate_host_target("   ").is_err());
        assert!(validate_host_target(&"a".repeat(256)).is_err());
    }

    #[test]
    fn is_lan_ip_accepts_private_and_loopback() {
        for ip in [
            "10.0.0.1",
            "192.168.1.50",
            "172.16.5.4",
            "127.0.0.1",
            "169.254.1.1",
        ] {
            assert!(is_lan_ip(ip), "deveria aceitar LAN: {ip}");
        }
        assert!(is_lan_ip("  192.168.0.1  ")); // trim
    }

    #[test]
    fn is_lan_ip_accepts_ipv6_private() {
        for ip in ["::1", "fd00::1", "fd12:3456:789a::1", "fe80::1"] {
            assert!(is_lan_ip(ip), "deveria aceitar IPv6 LAN: {ip}");
        }
    }

    #[test]
    fn is_lan_ip_rejects_public_and_garbage() {
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
    fn shared_secret_is_never_empty() {
        // Sem `TOOLKIT_GTI_SECRET`, cai no DEFAULT_SECRET (decisão de produto).
        assert!(!shared_secret().trim().is_empty());
    }

    #[test]
    fn sanitize_log_label_strips_control_chars_and_truncates() {
        assert_eq!(sanitize_log_label("clean_temp"), "clean_temp");
        assert_eq!(sanitize_log_label("a\nFAKE LOG\r"), "a?FAKE?LOG?");
        let long = "x".repeat(200);
        let out = sanitize_log_label(&long);
        assert!(out.starts_with(&"x".repeat(64)));
        assert!(out.chars().count() <= 65);
    }

    #[test]
    fn constant_time_eq_matches_semantics_of_equality() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab")); // comprimentos diferentes
    }
}
