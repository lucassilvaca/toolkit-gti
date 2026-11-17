use crate::commands::admin::network_config::DEFAULT_CHAT_PORT;
use serde::{Deserialize, Serialize};

pub const PIPE_NAME: &str = r"\\.\pipe\toolkit-notification";
pub const CHAT_PORT: u16 = DEFAULT_CHAT_PORT;

// As requisições internas da LAN (`/invite`, `/reply`, `/invite/validate`,
// `/whoami`) são autenticadas por ASSINATURA HMAC (ver `crate::infra::net_auth`)
// — o segredo compartilhado nunca trafega (H2).
//
// As defesas puras (segredo compartilhado e SSRF guard) vivem em
// `crate::infra::net_guard` — um módulo sem dependências de
// Tauri/serde, testável fora do binário do lib. Reexportadas aqui para manter
// os call sites (`crate::infra::named_pipe::{...}`) inalterados.
pub use crate::infra::net_guard::{is_lan_ip, secret_is_default, shared_secret};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatInvitePayload {
    pub admin_name: String,
    pub admin_host: String,
    pub admin_ip: String,
    pub message: Option<String>,
    pub duration: u8,
    pub room_id: String,
    pub ws_port: u16,
    pub room_token: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum PipeMessage {
    #[serde(rename = "notification")]
    Notification {
        admin_name: String,
        admin_host: String,
        #[serde(default)]
        admin_ip: String,
        #[serde(default = "default_notification_port")]
        ws_port: u16,
        message: String,
        duration: u8,
    },
    #[serde(rename = "reply")]
    Reply {
        user_name: String,
        user_host: String,
        reply_message: String,
    },
    #[serde(rename = "chat_invite")]
    ChatInvite {
        admin_name: String,
        admin_host: String,
        admin_ip: String,
        message: Option<String>,
        duration: u8,
        room_id: String,
        ws_port: u16,
        #[serde(default)]
        room_token: String,
    },
}

#[derive(Serialize)]
pub struct NotificationResult {
    pub method: String,
}

pub fn default_notification_port() -> u16 {
    CHAT_PORT
}

pub fn env_or(var: &str, default: &str) -> String {
    std::env::var(var).unwrap_or_else(|_| default.to_string())
}

pub fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_invite_serializes_with_room_id_and_ws_port_and_token() {
        let msg = PipeMessage::ChatInvite {
            admin_name: "Tecnico".into(),
            admin_host: "PC-GTI".into(),
            admin_ip: "10.0.0.1".into(),
            message: Some("Ola".into()),
            duration: 5,
            room_id: "abc-123".into(),
            ws_port: 8765,
            room_token: "tok-xyz".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(
            json.contains("\"room_id\":\"abc-123\""),
            "room_id missing: {}",
            json
        );
        assert!(
            json.contains("\"ws_port\":8765"),
            "ws_port missing: {}",
            json
        );
        assert!(
            json.contains("\"room_token\":\"tok-xyz\""),
            "room_token missing: {}",
            json
        );
    }

    #[test]
    fn chat_invite_deserializes_preserving_new_fields() {
        let json = r#"{"type":"chat_invite","admin_name":"T","admin_host":"H","admin_ip":"1.2.3.4","duration":5,"room_id":"xyz","ws_port":8765,"room_token":"secret"}"#;
        let msg: PipeMessage = serde_json::from_str(json).unwrap();
        match msg {
            PipeMessage::ChatInvite {
                room_id,
                ws_port,
                room_token,
                ..
            } => {
                assert_eq!(room_id, "xyz");
                assert_eq!(ws_port, 8765);
                assert_eq!(room_token, "secret");
            }
            _ => panic!("Wrong variant"),
        }
    }

    // Os testes de is_lan_ip / secret_matches vivem em `crate::infra::net_guard`
    // (via `tests/security.rs`); os da assinatura HMAC, em `tests/net_auth.rs`.

    #[test]
    fn chat_invite_deserializes_without_token_for_backward_compatibility() {
        let json = r#"{"type":"chat_invite","admin_name":"T","admin_host":"H","admin_ip":"1.2.3.4","duration":5,"room_id":"xyz","ws_port":8765}"#;
        let msg: PipeMessage = serde_json::from_str(json).unwrap();
        match msg {
            PipeMessage::ChatInvite { room_token, .. } => {
                assert_eq!(
                    room_token, "",
                    "token ausente deve default para string vazia"
                );
            }
            _ => panic!("Wrong variant"),
        }
    }
}
