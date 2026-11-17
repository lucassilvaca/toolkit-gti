use crate::commands::session::require_valid_session;
use crate::domain::system::local_ip_toward;
use crate::error_handling::{ApiError, ApiResult};
use crate::infra::named_pipe::{
    env_or, is_lan_ip, send_chat_invite_over_http, send_reply_over_http, send_via_msg_exe,
    send_via_pipe, ChatInvitePayload, InviteDelivery, NotificationResult, PipeMessage, CHAT_PORT,
};
use crate::infra::net_guard::validate_host_target;
use crate::session::SessionsState;
use serde::Serialize;
use std::net::SocketAddr;
use tauri::State;

/// IP do técnico que o PC do usuário consegue alcançar de volta: o IP de
/// origem da rota até o usuário. O `fallback` vem do frontend e segue a rota
/// da internet; com VPN split-tunnel em casa ele é o IP do Wi-Fi doméstico,
/// inalcançável para o usuário.
async fn reachable_admin_ip(hostname: &str, port: u16, fallback: String) -> String {
    let addrs: Vec<SocketAddr> = match tokio::net::lookup_host((hostname, port)).await {
        Ok(addrs) => addrs.collect(),
        Err(e) => {
            log_warn!("reachable_admin_ip: '{}' não resolveu: {}", hostname, e);
            return fallback;
        }
    };
    let routed = addrs
        .iter()
        .find(|a| a.is_ipv4())
        .or(addrs.first())
        .and_then(|a| local_ip_toward(*a))
        .map(|ip| ip.to_string())
        // O app do usuário só aceita convite de IP de LAN (anti-SSRF).
        .filter(|ip| is_lan_ip(ip));
    match routed {
        Some(ip) => {
            if ip != fallback {
                log_info!(
                    "IP do técnico para '{}': {} (frontend enviou {})",
                    hostname,
                    ip,
                    fallback
                );
            }
            ip
        }
        None => fallback,
    }
}

/// Resultado do convite devolvido ao frontend (`callUser.ts`).
#[derive(Serialize)]
pub struct InviteResult {
    /// `true` = usuário já em atendimento; o convite não foi exibido.
    pub busy: bool,
}

#[tauri::command]
pub async fn send_notification(
    hostname: String,
    admin_ip: Option<String>,
    ws_port: Option<u16>,
    message: String,
    duration: u8,
    sessions: State<'_, SessionsState>,
) -> ApiResult<NotificationResult> {
    require_valid_session(&sessions).await?;
    log_debug!(
        "send_notification: START - host='{}', message='{}', duration={}",
        hostname,
        message,
        duration
    );

    let admin_name = env_or("USERNAME", "Tecnico");
    let admin_host = env_or("COMPUTERNAME", "GTI");
    log_debug!("Admin: {}@{}", admin_name, admin_host);

    let ws_port = ws_port.unwrap_or(CHAT_PORT);
    let admin_ip = match admin_ip {
        Some(ip) => reachable_admin_ip(&hostname, ws_port, ip).await,
        None => String::new(),
    };
    let payload = PipeMessage::Notification {
        admin_name: admin_name.clone(),
        admin_host: admin_host.clone(),
        admin_ip,
        ws_port,
        message: message.clone(),
        duration: duration.min(10),
    };

    match send_via_pipe(&hostname, &payload).await {
        Ok(()) => {
            log_info!("send_notification: SUCCESS via named pipe");
            return Ok(NotificationResult {
                method: "toolkit".to_string(),
            });
        }
        Err(pipe_err) => {
            log_warn!(
                "Named pipe failed for '{}': {} — falling back to msg.exe",
                hostname,
                pipe_err
            );
        }
    }

    match send_via_msg_exe(&hostname, &admin_name, &message) {
        Ok(method) => Ok(NotificationResult { method }),
        Err(_) => Err(ApiError::pipe_error(&format!(
            "Não foi possível alcançar '{}' (Named Pipe e msg.exe falharam)",
            hostname
        ))),
    }
}

/// Duração do convite: até 60 s. Com 5-10 s o usuário mal via o pop-up antes
/// de fechar (o convite "não chegava").
#[tauri::command]
// Contrato IPC: os campos chegam nomeados do frontend via `invoke`; agrupá-los em
// struct mudaria o shape esperado no JS. O excesso de argumentos é intencional.
#[allow(clippy::too_many_arguments)]
pub async fn send_chat_invite(
    hostname: String,
    admin_ip: String,
    room_id: String,
    room_token: String,
    ws_port: u16,
    message: Option<String>,
    duration: u8,
    sessions: State<'_, SessionsState>,
) -> ApiResult<InviteResult> {
    require_valid_session(&sessions).await?;
    log_debug!(
        "send_chat_invite: host='{}', admin_ip='{}', room_id='{}'",
        hostname,
        admin_ip,
        room_id
    );

    let admin_name = env_or("USERNAME", "Tecnico");
    let admin_host = env_or("COMPUTERNAME", "GTI");

    let ws_host = if hostname == "localhost" || hostname == "127.0.0.1" {
        "127.0.0.1".to_string()
    } else {
        reachable_admin_ip(&hostname, ws_port, admin_ip).await
    };
    log_debug!("send_chat_invite: ws_host resolved to '{}'", ws_host);

    let payload = ChatInvitePayload {
        admin_name,
        admin_host,
        admin_ip: ws_host,
        message,
        duration: duration.min(60),
        room_id,
        ws_port,
        room_token,
    };

    match send_chat_invite_over_http(&hostname, ws_port, &payload).await {
        Ok(InviteDelivery::Accepted) => Ok(InviteResult { busy: false }),
        Ok(InviteDelivery::Busy) => {
            log_info!(
                "send_chat_invite: '{}' já em atendimento — convite não exibido",
                hostname
            );
            Ok(InviteResult { busy: true })
        }
        Err(e) => {
            log_error!("send_chat_invite failed for '{}': {}", hostname, e);
            Err(ApiError::network_error().with_details(&e))
        }
    }
}

#[tauri::command]
pub async fn send_reply(
    technician_host: String,
    technician_ip: Option<String>,
    ws_port: Option<u16>,
    reply_message: String,
) -> ApiResult<NotificationResult> {
    // Sem require_valid_session por design: quem chama é o PC do usuário
    // (popup/convite), que nunca faz login. Por isso o destino é validado aqui:
    // IP só de LAN (anti-SSRF) e host no charset de hostname antes do pipe.
    if reply_message.chars().count() > 2000 {
        return Err(ApiError::validation_error("reply_message")
            .with_details("Resposta muito longa (máximo 2000 caracteres)"));
    }

    log_debug!(
        "send_reply: START - host='{}', message='{}'",
        technician_host,
        reply_message
    );

    let user_name = env_or("USERNAME", "Usuario");
    let user_host = env_or("COMPUTERNAME", "PC");
    log_debug!("User: {}@{}", user_name, user_host);

    let payload = PipeMessage::Reply {
        user_name: user_name.clone(),
        user_host: user_host.clone(),
        reply_message: reply_message.clone(),
    };

    if let Some(ip) = technician_ip.as_deref().map(str::trim).filter(|value| {
        let lan = is_lan_ip(value);
        if !value.is_empty() && !lan {
            log_warn!("send_reply: IP '{}' fora da LAN ignorado", value);
        }
        lan
    }) {
        let port = ws_port.unwrap_or(CHAT_PORT);
        match send_reply_over_http(ip, port, &payload).await {
            Ok(()) => {
                log_info!("send_reply: SUCCESS via HTTP to '{}:{}'", ip, port);
                return Ok(NotificationResult {
                    method: "http".to_string(),
                });
            }
            Err(error) => {
                log_warn!(
                    "send_reply: HTTP failed for '{}:{}': {} - falling back to named pipe",
                    ip,
                    port,
                    error
                );
            }
        }
    }

    // O host vira caminho UNC (\\host\pipe\...); barra ou espaço mudariam o alvo.
    let technician_host = validate_host_target(&technician_host)
        .map_err(|e| ApiError::validation_error("technician_host").with_details(&e))?;

    send_via_pipe(&technician_host, &payload)
        .await
        .map(|()| NotificationResult {
            method: "toolkit".to_string(),
        })
        .map_err(|e| {
            log_error!("send_reply failed for '{}': {}", technician_host, e);
            ApiError::pipe_error(&e)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reachable_admin_ip_follows_route_to_user() {
        // Destino loopback: a origem roteada é 127.0.0.1, não o IP do frontend.
        let ip = reachable_admin_ip("127.0.0.1", CHAT_PORT, "192.168.1.50".into()).await;
        assert_eq!(ip, "127.0.0.1");
    }

    #[tokio::test]
    async fn reachable_admin_ip_keeps_fallback_when_unresolvable() {
        let ip = reachable_admin_ip("host-inexistente.invalid", CHAT_PORT, "10.0.0.5".into()).await;
        assert_eq!(ip, "10.0.0.5");
    }
}
