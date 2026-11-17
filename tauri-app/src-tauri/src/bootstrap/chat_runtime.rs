//! Chat runtime bootstrap extracted from `lib.rs`.

use crate::events::{clear_alert, raise_alert};
use crate::infra::windows::CREATE_NO_WINDOW;
use crate::{commands, commands::WsServerState, logging::is_access_denied};
use std::sync::Arc;
use tauri::{App, AppHandle};

pub fn initialize_chat_system(app: &mut App, ws_state: Arc<WsServerState>) -> tauri::Result<()> {
    let chat_port = commands::admin::network_config::load_chat_port(&app.handle().clone());
    log_info!("Resolved chat port from config: {}", chat_port);

    // SEGURANÇA (H2): o HMAC que assina convites/pop-ups da LAN usa o segredo
    // compartilhado (`net_guard::shared_secret`). Sem `TOOLKIT_GTI_SECRET`
    // provisionado, caímos no DEFAULT_SECRET público: o chat funciona
    // out-of-the-box na LAN, porém com isolamento mínimo. Aqui apenas avisamos —
    // NÃO abortamos, para não deixar o chat inutilizável sem provisionamento.
    // Para endurecer, provisione a variável (mesmo valor em todas as máquinas)
    // via GPO/MSI.
    if crate::infra::named_pipe::secret_is_default() {
        log_warn!(
            "TOOLKIT_GTI_SECRET nao configurado — usando segredo default PUBLICO da LAN. \
             Para maior isolamento, defina a variavel (mesmo valor em todas as maquinas) via GPO/MSI."
        );
    }

    spawn_pipe_server(app.handle().clone());
    spawn_firewall_setup(app.handle().clone(), chat_port);
    spawn_ws_server(app.handle().clone(), ws_state, chat_port);

    Ok(())
}

fn spawn_pipe_server(app_handle: AppHandle) {
    log_debug!("Step 6: Starting Named Pipe server...");
    tauri::async_runtime::spawn(async move {
        log_info!("Named Pipe server task starting...");
        crate::infra::named_pipe::start_pipe_server(app_handle).await;
    });
    log_debug!("Step 6 COMPLETE: Named Pipe server spawned");
}

fn spawn_firewall_setup(app_handle: AppHandle, chat_port: u16) {
    log_debug!("Step 7: Setting up firewall rule...");
    // Mesmo nome do wix/firewall.wxs: o MSI cria e remove esta regra na
    // desinstalação; nome diferente gerava regra duplicada e órfã.
    let firewall_rule_name = format!("Toolkit GTI Chat WS {}", chat_port);
    let firewall_delete_name = format!("name={}", firewall_rule_name);
    let legacy_delete_name = format!("name=Toolkit GTI Chat WS {}", chat_port);
    let firewall_local_port = format!("localport={}", chat_port);

    tauri::async_runtime::spawn(async move {
        tokio::task::spawn_blocking(move || {
            log_info!("=== FIREWALL RULE SETUP (blocking task) ===");

            #[cfg(windows)]
            use std::os::windows::process::CommandExt;

            log_debug!("Checking admin privileges...");
            let is_admin = commands::public::system_info::is_admin();
            log_info!("is_admin check result: {}", is_admin);

            if !is_admin {
                log_error!("*** NOT RUNNING AS ADMINISTRATOR ***");
                log_error!("Firewall rule will NOT be created automatically.");
                log_error!("Inbound connections on port {} may be BLOCKED.", chat_port);
                log_error!("Solution: Run as Administrator or create rule manually:");
                log_error!(
                    "  netsh advfirewall firewall add rule name=\"{}\" protocol=TCP dir=in localport={} action=allow",
                    firewall_rule_name,
                    chat_port
                );

                raise_alert(&app_handle, "firewall-warning", "Aplicativo não está rodando como Administrador. Conexões de chat podem ser bloqueadas pelo firewall.");
                return;
            }

            log_info!("Running as Administrator - proceeding with firewall rule");

            log_debug!("Step 7a: Removing old firewall rule if exists...");
            let delete_output = std::process::Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args([
                    "advfirewall",
                    "firewall",
                    "delete",
                    "rule",
                    firewall_delete_name.as_str(),
                ])
                .output();

            match delete_output {
                Ok(output) => {
                    if output.status.success() {
                        log_info!("Step 7a COMPLETE: Old firewall rule removed successfully");
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        if stderr.contains("No rules match") || stdout.contains("No rules match") {
                            log_debug!("Step 7a COMPLETE: No old rule to remove (OK)");
                        } else {
                            log_warn!("Step 7a WARNING: Error removing old rule");
                            log_warn!("  stdout: {}", stdout);
                            log_warn!("  stderr: {}", stderr);
                        }
                    }
                }
                Err(e) => {
                    log_error!("Step 7a FAILED: netsh delete command failed");
                    log_error!("  Error: {}", e);
                    log_error!("  OS Error: {:?}", e.raw_os_error());
                    if is_access_denied(&e) {
                        log_error!("*** OS ERROR 5: ACCESS DENIED on netsh delete ***");
                        log_error!("This indicates insufficient privileges for firewall modification.");
                    }
                }
            }

            // Best-effort: remove a regra com o nome antigo (≤ 1.3.6). Falha
            // aqui (regra inexistente) é o caso normal e não afeta o chat.
            let _ = std::process::Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args([
                    "advfirewall",
                    "firewall",
                    "delete",
                    "rule",
                    legacy_delete_name.as_str(),
                ])
                .output();

            log_debug!("Step 7b: Creating new firewall rule for port {}...", chat_port);
            log_debug!(
                "Command: netsh advfirewall firewall add rule name=\"{}\" protocol=TCP dir=in localport={} action=allow profile=any",
                firewall_rule_name,
                chat_port
            );

            let add_output = std::process::Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args([
                    "advfirewall",
                    "firewall",
                    "add",
                    "rule",
                    firewall_delete_name.as_str(),
                    "protocol=TCP",
                    "dir=in",
                    firewall_local_port.as_str(),
                    "action=allow",
                    "profile=any",
                ])
                .output();

            match add_output {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let stderr = String::from_utf8_lossy(&output.stderr);

                    if output.status.success() {
                        log_info!("Step 7b SUCCESS: Firewall rule created for port {}", chat_port);
                        log_debug!("  stdout: {}", stdout);
                        clear_alert(&app_handle, "firewall-error");
                        clear_alert(&app_handle, "firewall-warning");
                    } else {
                        log_error!("Step 7b FAILED: Firewall rule creation failed");
                        log_error!("  stdout: {}", stdout);
                        log_error!("  stderr: {}", stderr);

                        // netsh escreve o erro em stdout; Windows pt-BR usa
                        // "Acesso negado" / "requer elevação".
                        let combined = format!("{} {}", stdout, stderr).to_lowercase();
                        let denied = [
                            "access is denied",
                            "acesso negado",
                            "elevation",
                            "elevação",
                        ]
                        .iter()
                        .any(|needle| combined.contains(needle));
                        if denied {
                            log_error!("*** OS ERROR 5: ACCESS DENIED in netsh output ***");
                            log_error!("The application needs Administrator privileges to modify the firewall.");
                            raise_alert(&app_handle, "firewall-error", "Acesso negado - Execute como Administrador");
                        } else {
                            raise_alert(&app_handle, "firewall-error", format!("Falha ao criar regra: {}", stderr));
                        }
                    }
                }
                Err(e) => {
                    log_error!("Step 7b FAILED: netsh add command failed");
                    log_error!("  Error: {}", e);
                    log_error!("  OS Error: {:?}", e.raw_os_error());

                    if is_access_denied(&e) {
                        log_error!("*** OS ERROR 5: ACCESS DENIED on netsh add ***");
                        log_error!("The application needs Administrator privileges to modify the firewall.");
                        raise_alert(&app_handle, "firewall-error", "Acesso negado - Execute como Administrador");
                    } else {
                        raise_alert(&app_handle, "firewall-error", format!("Erro ao criar regra: {}", e));
                    }
                }
            }

            log_info!("=== FIREWALL RULE SETUP COMPLETE ===");
        })
        .await
        .ok();
    });
    log_debug!("Step 7 COMPLETE: Firewall task spawned");
}

fn spawn_ws_server(app_handle: AppHandle, ws_state: Arc<WsServerState>, chat_port: u16) {
    log_debug!("Step 8: Starting WS chat server...");
    tauri::async_runtime::spawn(async move {
        log_info!("HTTP/WS chat server task starting on port {}...", chat_port);
        commands::public::chat::boot_ws_server(app_handle, ws_state, chat_port).await;
    });
    log_info!("HTTP/WS chat server spawn scheduled");
    log_debug!("Step 8 COMPLETE: WS server spawn handled");
}
