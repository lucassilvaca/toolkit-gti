use std::os::windows::process::CommandExt;
use std::process::Command;
use tokio::io::AsyncWriteExt;
use tokio::net::windows::named_pipe::ClientOptions;

use super::types::*;
use crate::infra::net_auth;
use crate::infra::windows::CREATE_NO_WINDOW;
use crate::logging::is_access_denied;

fn resolve_pipe_path(hostname: &str) -> String {
    let path = if hostname == "localhost" || hostname == "127.0.0.1" {
        log_debug!("Resolving pipe path for localhost");
        PIPE_NAME.to_string()
    } else {
        log_debug!("Resolving pipe path for remote host: {}", hostname);
        format!(r"\\{}\pipe\toolkit-notification", hostname)
    };
    log_debug!("Resolved pipe path: {}", path);
    path
}

async fn open_pipe_client(
    pipe_path: &str,
) -> Result<tokio::net::windows::named_pipe::NamedPipeClient, std::io::Error> {
    log_debug!("open_pipe_client: Connecting to '{}'", pipe_path);

    let mut retries = 0u8;
    loop {
        log_debug!("Attempt {} to connect to named pipe...", retries + 1);

        match ClientOptions::new().open(pipe_path) {
            Ok(c) => {
                log_info!("Successfully connected to named pipe '{}'", pipe_path);
                return Ok(c);
            }
            Err(e) if e.raw_os_error() == Some(231) && retries < 5 => {
                log_warn!(
                    "Named pipe busy (error 231), retrying in 200ms... (attempt {}/5)",
                    retries + 1
                );
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                retries += 1;
            }
            Err(e) => {
                let os_code = e.raw_os_error();
                log_error!(
                    "Failed to connect to named pipe '{}': {} (OS Error: {:?})",
                    pipe_path,
                    e,
                    os_code
                );

                if is_access_denied(&e) {
                    log_error!("*** OS ERROR 5: ACCESS DENIED connecting to named pipe ***");
                    log_error!("This indicates:");
                    log_error!("  1. The target machine may have security restrictions");
                    log_error!("  2. Antivirus/Corporate security software blocking");
                    log_error!("  3. The target app is not running or not listening");
                } else if os_code == Some(2) {
                    log_error!(
                        "Named pipe does not exist (error 2) - target app may not be running"
                    );
                }

                return Err(e);
            }
        }
    }
}

pub async fn send_via_pipe(hostname: &str, payload: &PipeMessage) -> Result<(), String> {
    log_debug!("send_via_pipe: Sending to host '{}'", hostname);

    let pipe_path = resolve_pipe_path(hostname);
    log_debug!("Step 1: Serializing message...");
    let json = serde_json::to_vec(payload).map_err(|e| {
        log_error!("Failed to serialize message: {}", e);
        e.to_string()
    })?;
    log_debug!("Step 1 COMPLETE: Serialized {} bytes", json.len());

    log_debug!("Step 2: Opening pipe client...");
    let mut client = open_pipe_client(&pipe_path).await.map_err(|e| {
        let hostname = hostname.to_string();
        let os_code = e.raw_os_error();
        let msg = if os_code == Some(5) {
            format!(
                "Acesso negado ao conectar em '{}' (OS Error 5).\n\
                     Causas prováveis:\n\
                     1. O Toolkit não está rodando no computador destino\n\
                     2. O usuário não tem permissões para pipes remotos\n\
                     3. Firewall bloqueando conexão SMB/pipes (porta 445)\n\
                     4. O computador destino está desligado ou inacessível",
                hostname
            )
        } else if os_code == Some(2) {
            format!("O host '{}' não está executando o Toolkit GTI.", hostname)
        } else {
            detailed_io_error(&format!("Não foi possível conectar em '{}'", hostname), &e)
        };
        log_error!("Step 2 FAILED: {}", msg);
        msg
    })?;
    log_debug!("Step 2 COMPLETE: Pipe client connected");

    log_debug!("Step 3: Writing {} bytes to pipe...", json.len());
    client.write_all(&json).await.map_err(|e| {
        let os_code = e.raw_os_error();
        log_error!(
            "Step 3 FAILED: Write error - {} (OS Error: {:?})",
            e,
            os_code
        );
        if os_code == Some(5) {
            log_error!("*** OS ERROR 5: ACCESS DENIED writing to pipe ***");
        }
        detailed_io_error("Erro ao escrever no pipe", &e)
    })?;
    log_debug!("Step 3 COMPLETE: Data written to pipe");

    log_debug!("Step 4: Flushing pipe...");
    client.flush().await.map_err(|e| {
        let os_code = e.raw_os_error();
        log_error!(
            "Step 4 FAILED: Flush error - {} (OS Error: {:?})",
            e,
            os_code
        );
        detailed_io_error("Erro no flush do pipe", &e)
    })?;
    log_debug!("Step 4 COMPLETE: Pipe flushed");

    log_info!("send_via_pipe: SUCCESS - message sent to '{}'", hostname);
    Ok(())
}

/// Resultado da entrega de um convite de chat ao usuário.
pub enum InviteDelivery {
    /// Convite entregue e exibido ao usuário.
    Accepted,
    /// Usuário já está em atendimento (janela de chat viva) — convite recusado.
    Busy,
}

pub async fn send_chat_invite_over_http(
    hostname: &str,
    ws_port: u16,
    payload: &ChatInvitePayload,
) -> Result<InviteDelivery, String> {
    let client = reqwest::Client::builder()
        // Conexão curta: host desligado falha rápido e a 2ª porta é tentada logo.
        // Resposta longa: o /invite confirma a sala com o PC do técnico
        // (/invite/validate) antes de responder — entre estados passava de 4 s.
        .connect_timeout(std::time::Duration::from_secs(3))
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Falha ao criar cliente HTTP: {}", e))?;

    // H2: corpo serializado uma única vez — esses bytes entram na assinatura
    // e são enviados.
    let body =
        serde_json::to_vec(payload).map_err(|e| format!("Falha ao serializar convite: {}", e))?;
    let secret = shared_secret();

    let mut ports_to_try = vec![ws_port];
    if ws_port != CHAT_PORT {
        ports_to_try.push(CHAT_PORT);
    }
    let mut errors = Vec::new();

    for target_port in ports_to_try {
        let url = format!("http://{}:{}/invite", hostname, target_port);
        log_debug!("send_chat_invite: POST {}", url);
        let signed = net_auth::sign_now(&secret, net_auth::OP_INVITE, &body);

        match client
            .post(&url)
            .header(net_auth::TS_HEADER, &signed.ts)
            .header(net_auth::NONCE_HEADER, &signed.nonce)
            .header(net_auth::SIG_HEADER, &signed.sig)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body.clone())
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => {
                // O endpoint /invite sempre responde HTTP 200 com { ok, reason }.
                // Um `reason: "busy"` significa que o usuário já está em atendimento.
                let body = response
                    .json::<serde_json::Value>()
                    .await
                    .unwrap_or(serde_json::Value::Null);
                let ok = body.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
                let reason = body.get("reason").and_then(|v| v.as_str()).unwrap_or("");
                if !ok && reason == "busy" {
                    log_info!(
                        "send_chat_invite: '{}' já está em atendimento (busy)",
                        hostname
                    );
                    return Ok(InviteDelivery::Busy);
                }
                log_info!(
                    "send_chat_invite delivered to '{}' via HTTP on port {}",
                    hostname,
                    target_port
                );
                return Ok(InviteDelivery::Accepted);
            }
            Ok(response) => {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                let err = format!("{} respondeu {} {}", url, status, body);
                log_warn!("send_chat_invite failed: {}", err);
                errors.push(err);
            }
            Err(e) => {
                let err = format!("{} -> {}", url, e);
                log_warn!("send_chat_invite failed: {}", err);
                errors.push(err);
            }
        }
    }

    let combined = errors.join(" | ");
    Err(format!(
        "Não foi possível entregar o convite para '{}' nas portas testadas. {}",
        hostname, combined
    ))
}

pub async fn send_reply_over_http(
    technician_ip: &str,
    ws_port: u16,
    payload: &PipeMessage,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .map_err(|e| format!("Falha ao criar cliente HTTP: {}", e))?;

    let url = format!("http://{}:{}/reply", technician_ip, ws_port);
    log_debug!("send_reply: POST {}", url);

    let body =
        serde_json::to_vec(payload).map_err(|e| format!("Falha ao serializar resposta: {}", e))?;
    let signed = net_auth::sign_now(&shared_secret(), net_auth::OP_REPLY, &body);

    match client
        .post(&url)
        .header(net_auth::TS_HEADER, &signed.ts)
        .header(net_auth::NONCE_HEADER, &signed.nonce)
        .header(net_auth::SIG_HEADER, &signed.sig)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body)
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => Ok(()),
        Ok(response) => {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            Err(format!("{} respondeu {} {}", url, status, body))
        }
        Err(e) => Err(format!("{} -> {}", url, e)),
    }
}

pub fn send_via_msg_exe(hostname: &str, admin_name: &str, message: &str) -> Result<String, String> {
    log_debug!(
        "send_via_msg_exe: Sending to '{}' from '{}'",
        hostname,
        admin_name
    );

    let full_msg = format!("[GTI - {}] {}", admin_name, message);
    log_debug!("Full message: {}", full_msg);

    log_debug!("Executing msg.exe...");
    let output = Command::new("msg")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/server", hostname, "*", &full_msg])
        .output()
        .map_err(|e| {
            log_error!(
                "Failed to execute msg.exe: {} (OS Error: {:?})",
                e,
                e.raw_os_error()
            );
            format!("msg.exe não disponível: {}", e)
        })?;

    if output.status.success() {
        log_info!("send_via_msg_exe: SUCCESS - message sent via msg.exe");
        Ok("Enviado via msg.exe (Windows nativo)".to_string())
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        log_error!("send_via_msg_exe FAILED:");
        log_error!("  stdout: {}", stdout);
        log_error!("  stderr: {}", stderr);

        if stderr.contains("Access is denied") || stderr.contains("5") {
            log_error!("*** OS ERROR 5: ACCESS DENIED in msg.exe output ***");
        }

        Err(format!("msg.exe falhou: {}", stderr.trim()))
    }
}

pub fn detailed_io_error(context: &str, e: &std::io::Error) -> String {
    if let Some(code) = e.raw_os_error() {
        let description = match code {
            2 => "Arquivo/pipe não encontrado - o servidor pode não estar rodando",
            5 => "ACESSO NEGADO - sem permissões para acessar o recurso",
            231 => "Pipe ocupado (ERROR_PIPE_BUSY) - todas as instâncias estão em uso",
            123 => "Nome de pipe inválido",
            121 => "Timeout de semáforo",
            10013 => "Permissão negada - socket em uso ou bloqueado",
            _ => "Erro desconhecido",
        };
        let mut msg = format!("{}: {} (OS Error {} - {})", context, e, code, description);

        if code == 5 {
            msg.push_str("\n\n*** OS ERROR 5: ACCESS DENIED ***");
            msg.push_str("\nPossible causes:");
            msg.push_str("\n  1. Named pipe requires Administrator privileges");
            msg.push_str("\n  2. Another process has exclusive access to the pipe");
            msg.push_str("\n  3. Windows security policy blocking pipe creation/access");
            msg.push_str("\n  4. Antivirus/Corporate security software blocking");
            msg.push_str("\n  5. Remote pipe access blocked by firewall (port 445)");
        }

        msg
    } else {
        format!("{}: {}", context, e)
    }
}
