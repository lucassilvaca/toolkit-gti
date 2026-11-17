use crate::commands::session::require_valid_session;
use crate::error_handling::{ApiError, ApiResult};
use crate::infra::console_text;
use crate::infra::net_guard::sanitize_log_label;
use crate::infra::windows::CREATE_NO_WINDOW;
use crate::session::SessionsState;
use serde::{Deserialize, Serialize};
use std::net::{TcpStream, ToSocketAddrs};
use std::os::windows::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;

// Safety limits for streaming commands
const MAX_STREAMING_DURATION: Duration = Duration::from_secs(5 * 60); // 5 minutes
const MAX_OUTPUT_LINES: usize = 1000;

// `validate_host_target` (guarda anti command-injection) vive em
// `crate::infra::net_guard` — módulo puro, testável fora do binário do lib.
// Reexportado aqui para manter os call sites (`super::network::...`) inalterados.
pub use crate::infra::net_guard::validate_host_target;

/// Holds the currently running streaming child process so it can be killed on demand.
pub struct StreamingProcessState(pub Arc<Mutex<Option<Child>>>);

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn run_ping(
    target: String,
    sessions: State<'_, SessionsState>,
) -> ApiResult<CommandResult> {
    require_valid_session(&sessions).await?;
    let target = validate_host_target(&target)
        .map_err(|e| ApiError::validation_error("target").with_details(&e))?;
    let output = tokio::task::spawn_blocking(move || {
        Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/C", "ping", "-n", "4", &target])
            .output()
    })
    .await??;

    let stdout = console_text::decode(&output.stdout);
    let stderr = console_text::decode(&output.stderr);

    Ok(CommandResult {
        success: output.status.success(),
        output: stdout,
        error: if stderr.is_empty() {
            None
        } else {
            Some(stderr)
        },
    })
}

#[tauri::command]
pub async fn run_netstat(sessions: State<'_, SessionsState>) -> ApiResult<CommandResult> {
    require_valid_session(&sessions).await?;
    let output = tokio::task::spawn_blocking(|| {
        Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/C", "netstat", "-an"])
            .output()
    })
    .await??;

    let stdout = console_text::decode(&output.stdout);
    let stderr = console_text::decode(&output.stderr);

    Ok(CommandResult {
        success: output.status.success(),
        output: stdout,
        error: if stderr.is_empty() {
            None
        } else {
            Some(stderr)
        },
    })
}

#[tauri::command]
pub async fn check_port(
    host: String,
    port: u16,
    sessions: State<'_, SessionsState>,
) -> ApiResult<bool> {
    require_valid_session(&sessions).await?;
    tokio::task::spawn_blocking(move || -> ApiResult<bool> {
        let addr = format!("{}:{}", host, port);
        let socket_addrs: Vec<_> = addr.to_socket_addrs()?.collect();

        if let Some(socket_addr) = socket_addrs.first() {
            match TcpStream::connect_timeout(socket_addr, Duration::from_secs(3)) {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            }
        } else {
            Err(ApiError::network_error().with_details("Could not resolve address"))
        }
    })
    .await?
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PortCheckResult {
    pub host: String,
    pub port80: bool,
    pub port443: bool,
    pub message: String,
}

#[tauri::command]
pub async fn check_web_ports(
    host: String,
    sessions: State<'_, SessionsState>,
) -> ApiResult<PortCheckResult> {
    require_valid_session(&sessions).await?;
    tokio::task::spawn_blocking(move || -> ApiResult<PortCheckResult> {
        let check = |port: u16| -> bool {
            let addr = format!("{}:{}", host, port);
            let Ok(mut addrs) = addr.to_socket_addrs() else {
                return false;
            };
            if let Some(socket_addr) = addrs.next() {
                TcpStream::connect_timeout(&socket_addr, Duration::from_secs(3)).is_ok()
            } else {
                false
            }
        };

        let port80 = check(80);
        let port443 = check(443);

        let http = if port80 { "Aberta" } else { "Fechada" };
        let https = if port443 { "Aberta" } else { "Fechada" };
        let message = format!("HTTP (80): {}  |  HTTPS (443): {}", http, https);

        Ok(PortCheckResult {
            host,
            port80,
            port443,
            message,
        })
    })
    .await?
}

/// Spawns a long-running network command (ping -t or tracert) and streams its output
/// line-by-line via "network-output" Tauri events. Emits "network-done" when finished.
///
/// Safety limits:
/// - Maximum runtime: 5 minutes
/// - Maximum output lines: 1000 lines
#[tauri::command]
pub async fn run_network_streaming(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamingProcessState>,
    command: String, // "ping_continuous" | "tracert"
    target: String,
    sessions: State<'_, SessionsState>,
) -> ApiResult<()> {
    require_valid_session(&sessions).await?;
    use tauri::Emitter;

    let target = validate_host_target(&target)
        .map_err(|e| ApiError::validation_error("target").with_details(&e))?;

    let child = match command.as_str() {
        "ping_continuous" => Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/C", "ping", "-t", &target])
            .stdout(Stdio::piped())
            .spawn()?,
        "tracert" => Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/C", "tracert", "-d", &target])
            .stdout(Stdio::piped())
            .spawn()?,
        _ => return Err(ApiError::command_failed(&format!("streaming: {}", command))),
    };

    // Store child in state so stop_streaming_command can kill it
    {
        let mut guard = state
            .0
            .lock()
            .map_err(|e| ApiError::internal_error().with_details(&e.to_string()))?;
        *guard = Some(child);
    }

    // Clone Arc so the blocking thread can access the child's stdout
    let arc = Arc::clone(&state.0);
    let app2 = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        // Take stdout out of the child (child stays in state for potential kill)
        let stdout = {
            if let Ok(mut guard) = arc.lock() {
                guard.as_mut().and_then(|c| c.stdout.take())
            } else {
                None
            }
        };

        if let Some(stdout) = stdout {
            let start_time = std::time::Instant::now();
            let mut line_count = 0;

            console_text::for_each_line(stdout, |line| {
                // Check timeout limit
                if start_time.elapsed() > MAX_STREAMING_DURATION {
                    let timeout_msg = format!(
                        "⚠️ Comando interrompido: limite de tempo de {} minutos atingido",
                        MAX_STREAMING_DURATION.as_secs() / 60
                    );
                    let _ = app2.emit("network-output", &timeout_msg);
                    return false;
                }

                // Check line count limit
                line_count += 1;
                if line_count > MAX_OUTPUT_LINES {
                    let lines_msg = format!(
                        "⚠️ Comando interrompido: limite de {} linhas de saída atingido",
                        MAX_OUTPUT_LINES
                    );
                    let _ = app2.emit("network-output", &lines_msg);
                    return false;
                }

                let _ = app2.emit("network-output", &line);
                true
            });

            // Emit final statistics
            let stats_msg = format!(
                "✅ Comando finalizado. {} linhas processadas em {:.1}s",
                line_count.min(MAX_OUTPUT_LINES),
                start_time.elapsed().as_secs_f64()
            );
            let _ = app2.emit("network-output", &stats_msg);
        }

        // Clean up the child entry and signal completion
        if let Ok(mut guard) = arc.lock() {
            if let Some(mut child) = guard.take() {
                // Try to kill the process gracefully first
                let _ = child.kill();

                // Wait for process to terminate with timeout
                std::thread::spawn(move || {
                    let _ = child.wait(); // reap zombie (no-op if already dead)
                });
            }
        }
        let _ = app2.emit("network-done", true);
    });

    Ok(())
}

/// Executa operacoes de `ipconfig` para diagnostico/correcao de rede.
///
/// Acoes suportadas (sem input do usuario -> sem risco de injecao):
/// - `flushdns`: limpa o cache de resolucao DNS (`ipconfig /flushdns`)
/// - `config`:   mostra a configuracao completa (`ipconfig /all`)
/// - `renew`:    renova o lease DHCP (`ipconfig /release` + `/renew`)
///
/// A saida (OEM) e decodificada por `console_text`.
#[tauri::command]
pub async fn run_ipconfig(
    action: String,
    sessions: State<'_, SessionsState>,
) -> ApiResult<CommandResult> {
    require_valid_session(&sessions).await?;

    let result = tokio::task::spawn_blocking(move || -> Result<CommandResult, String> {
        let run = |cmd: &str| -> Result<std::process::Output, String> {
            Command::new("cmd")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["/C", cmd])
                .output()
                .map_err(|e| e.to_string())
        };

        let output = match action.as_str() {
            "flushdns" => run("ipconfig /flushdns")?,
            "config" => run("ipconfig /all")?,
            "renew" => {
                // Libera o lease atual antes de pedir um novo. O /release pode
                // "falhar" se nao houver lease ativo; ignoramos e seguimos.
                let _ = run("ipconfig /release")?;
                run("ipconfig /renew")?
            }
            other => {
                return Err(format!(
                    "Acao ipconfig desconhecida: {}",
                    sanitize_log_label(other)
                ))
            }
        };

        let stderr = console_text::decode(&output.stderr);
        Ok(CommandResult {
            success: output.status.success(),
            output: console_text::decode(&output.stdout),
            error: if stderr.is_empty() {
                None
            } else {
                Some(stderr)
            },
        })
    })
    .await
    .map_err(|e| ApiError::internal_error().with_details(&e.to_string()))?
    .map_err(|e| ApiError::command_failed(&e))?;

    Ok(result)
}

/// Kills the currently running streaming network command (if any).
#[tauri::command]
pub async fn stop_streaming_command(
    state: tauri::State<'_, StreamingProcessState>,
    sessions: State<'_, SessionsState>,
) -> ApiResult<()> {
    require_valid_session(&sessions).await?;
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn command_result_success() {
        let r = CommandResult {
            success: true,
            output: "Resposta do ping".to_string(),
            error: None,
        };
        assert!(r.success);
        assert!(r.error.is_none());
    }

    #[test]
    fn command_result_failure_with_stderr() {
        let r = CommandResult {
            success: false,
            output: String::new(),
            error: Some("Host inacessível".to_string()),
        };
        assert!(!r.success);
        assert_eq!(r.error.as_deref(), Some("Host inacessível"));
    }

    #[test]
    fn port_check_result_construction() {
        let r = PortCheckResult {
            host: "10.0.0.1".to_string(),
            port80: true,
            port443: false,
            message: "HTTP (80): Aberta  |  HTTPS (443): Fechada".to_string(),
        };
        assert_eq!(r.host, "10.0.0.1");
        assert!(r.port80);
        assert!(!r.port443);
        assert!(r.message.contains("Aberta"));
    }

    #[test]
    fn streaming_process_state_starts_empty() {
        let state = StreamingProcessState(Arc::new(Mutex::new(None)));
        let guard = state.0.lock().unwrap();
        assert!(guard.is_none());
    }

    // Os testes de validate_host_target vivem em `crate::infra::net_guard`
    // (onde a função agora reside) e rodam via `tests/security.rs` (#[path]).

    #[test]
    fn test_streaming_limits() {
        // Test that our constants are reasonable
        assert_eq!(MAX_STREAMING_DURATION.as_secs(), 300); // 5 minutes
        assert_eq!(MAX_OUTPUT_LINES, 1000);

        // These are the safety limits to prevent resource exhaustion
        assert!(MAX_STREAMING_DURATION.as_secs() > 60); // At least 1 minute
        assert!(MAX_OUTPUT_LINES > 100); // At least 100 lines
    }
}
