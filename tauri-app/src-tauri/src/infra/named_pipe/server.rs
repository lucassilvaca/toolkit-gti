use tauri::AppHandle;
use tokio::io::AsyncReadExt;
use tokio::net::windows::named_pipe::{ClientOptions, ServerOptions};
use tokio::task;

use super::client::detailed_io_error;
use super::types::*;
use crate::events::raise_alert;
use crate::infra::net_guard::sanitize_log_label;
use crate::infra::toast::*;
use crate::logging::is_access_denied;

fn check_pipe_exists() -> bool {
    log_debug!("Checking if named pipe '{}' exists...", PIPE_NAME);

    match ClientOptions::new().open(PIPE_NAME) {
        Ok(_) => {
            log_debug!("Named pipe '{}' EXISTS (connection succeeded)", PIPE_NAME);
            true
        }
        Err(e) => {
            let code = e.raw_os_error();
            if code == Some(2) {
                log_debug!("Named pipe '{}' DOES NOT EXIST (error 2)", PIPE_NAME);
                false
            } else if code == Some(231) {
                log_debug!("Named pipe '{}' EXISTS but BUSY (error 231)", PIPE_NAME);
                true
            } else {
                log_warn!(
                    "Named pipe '{}' check returned error: {} (OS Error: {:?})",
                    PIPE_NAME,
                    e,
                    code
                );
                if is_access_denied(&e) {
                    log_error!("*** OS ERROR 5 checking pipe existence ***");
                }
                false
            }
        }
    }
}

fn test_pipe_creation() -> Result<(), String> {
    log_debug!("Testing named pipe creation...");

    match ServerOptions::new().create(PIPE_NAME) {
        Ok(_) => {
            log_debug!("Named pipe creation test: SUCCESS");
            Ok(())
        }
        Err(e) => {
            let msg = detailed_io_error("Failed to create named pipe", &e);
            log_error!("Named pipe creation test: FAILED - {}", msg);
            Err(msg)
        }
    }
}

pub async fn start_pipe_server(app: AppHandle) {
    log_info!("=== NAMED PIPE SERVER STARTING ===");
    log_debug!("Pipe name: {}", PIPE_NAME);

    let pipe_exists = task::spawn_blocking(check_pipe_exists)
        .await
        .unwrap_or(false);
    if pipe_exists {
        log_warn!(
            "Named pipe '{}' already exists - another instance may be running",
            PIPE_NAME
        );
        log_warn!("This instance will try to create its own pipe server anyway.");
    }

    let creation_result = task::spawn_blocking(test_pipe_creation)
        .await
        .unwrap_or(Ok(()));
    if let Err(e) = creation_result {
        log_error!("Cannot create named pipe: {}", e);
        raise_alert(
            &app,
            "pipe-error",
            format!("Falha ao criar named pipe: {}", e),
        );
    }

    log_info!("Entering named pipe server loop...");

    loop {
        log_debug!("Creating new named pipe server instance...");

        let server = match ServerOptions::new().create(PIPE_NAME) {
            Ok(s) => {
                log_debug!("Named pipe created successfully");
                s
            }
            Err(e) => {
                let os_code = e.raw_os_error();
                log_error!(
                    "Failed to create named pipe: {} (OS Error: {:?})",
                    e,
                    os_code
                );

                if is_access_denied(&e) {
                    log_error!("*** OS ERROR 5: ACCESS DENIED creating named pipe ***");
                    log_error!("This is likely caused by:");
                    log_error!("  1. Another process has exclusive access to the pipe");
                    log_error!("  2. Windows security policy blocking pipe creation");
                    log_error!("  3. Antivirus/Corporate security software blocking");
                    log_error!("  4. Insufficient privileges (run as Administrator)");

                    raise_alert(
                        &app,
                        "pipe-error",
                        "Acesso negado ao criar named pipe. Execute como Administrador.",
                    );
                } else if os_code == Some(231) {
                    log_warn!("Pipe is busy (error 231) - will retry in 2 seconds");
                } else {
                    log_error!("Unknown error creating pipe - will retry in 2 seconds");
                }

                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                continue;
            }
        };

        log_debug!("Waiting for client connection...");

        match server.connect().await {
            Ok(()) => {
                log_info!("Client connected to named pipe");
            }
            Err(e) => {
                let os_code = e.raw_os_error();
                log_error!(
                    "Failed to accept pipe connection: {} (OS Error: {:?})",
                    e,
                    os_code
                );

                if is_access_denied(&e) {
                    log_error!("*** OS ERROR 5: ACCESS DENIED on pipe connect ***");
                }

                continue;
            }
        }

        log_debug!("Reading data from client...");

        let mut buf = Vec::new();
        let mut limited = server.take(64 * 1024);

        match limited.read_to_end(&mut buf).await {
            Ok(n) => {
                log_debug!("Read {} bytes from client", n);
            }
            Err(e) => {
                let os_code = e.raw_os_error();
                log_error!("Failed to read from pipe: {} (OS Error: {:?})", e, os_code);

                if is_access_denied(&e) {
                    log_error!("*** OS ERROR 5: ACCESS DENIED on pipe read ***");
                }

                continue;
            }
        }

        log_debug!("Parsing message ({} bytes)...", buf.len());

        match serde_json::from_slice::<PipeMessage>(&buf) {
            Ok(PipeMessage::Notification {
                admin_name,
                admin_host,
                admin_ip,
                ws_port,
                message,
                duration,
            }) => {
                log_debug!("Received Notification from {}@{}", admin_name, admin_host);
                show_notification_window(
                    &app,
                    admin_name,
                    admin_host,
                    admin_ip,
                    ws_port,
                    message,
                    duration.min(10),
                );
            }
            Ok(PipeMessage::Reply {
                user_name,
                user_host,
                reply_message,
            }) => {
                log_debug!("Received Reply from {}@{}", user_name, user_host);
                show_reply_window(&app, user_name, user_host, reply_message);
            }
            Ok(PipeMessage::ChatInvite {
                admin_name,
                admin_host,
                ..
            }) => {
                // SEGURANÇA: o pipe não tem HMAC nem confirmação da sala com a
                // origem. Convite de chat só entra por POST /invite (ws_server).
                log_warn!(
                    "ChatInvite via pipe de {}@{} ignorado (use /invite assinado)",
                    sanitize_log_label(&admin_name),
                    sanitize_log_label(&admin_host)
                );
            }
            Err(e) => {
                log_error!("Failed to parse pipe message: {}", e);
                log_error!("Raw data: {:?}", String::from_utf8_lossy(&buf));
            }
        }
    }
}
