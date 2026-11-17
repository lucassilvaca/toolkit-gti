use super::network::{validate_host_target, CommandResult};
use crate::commands::session::require_valid_session;
use crate::error_handling::{ApiError, ApiResult};
use crate::infra::console_text;
use crate::infra::net_guard::sanitize_log_label;
use crate::infra::windows::CREATE_NO_WINDOW;
use crate::session::SessionsState;
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{Emitter, State};

fn run_cmd_command(command: &str) -> Result<CommandResult, String> {
    // Sem console, `chcp 65001` não vale: a saída vem em OEM/UTF-16 e é
    // decodificada por `console_text`.
    let output = Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/C", command])
        .output()
        .map_err(|e| e.to_string())?;

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

fn msra_path() -> PathBuf {
    let system_path = std::env::var_os("WINDIR")
        .map(|windows_dir| PathBuf::from(windows_dir).join("System32").join("msra.exe"));

    match system_path {
        Some(path) if path.is_file() => path,
        _ => PathBuf::from("msra.exe"),
    }
}

fn clean_temp_files() -> Result<CommandResult, String> {
    let temp_paths = [
        std::env::var("TEMP").unwrap_or_default(),
        std::env::var("TMP").unwrap_or_default(),
        format!(
            "{}\\AppData\\Local\\Temp",
            std::env::var("USERPROFILE").unwrap_or_default()
        ),
    ];

    let prefetch = std::env::var("WINDIR")
        .map(|windir| format!("{windir}\\Prefetch"))
        .unwrap_or_else(|_| r"C:\Windows\Prefetch".to_string());

    let mut tally = CleanTally::default();
    for dir in temp_paths
        .iter()
        .chain(std::iter::once(&prefetch))
        .filter(|p| !p.is_empty())
    {
        clean_dir(Path::new(dir), &mut tally);
    }

    let mut output = format!("Arquivos temporários: {} itens removidos", tally.removed);
    if tally.skipped > 0 {
        output.push_str(&format!(
            "; {} em uso ou protegidos (ignorados — normal com programas abertos)",
            tally.skipped
        ));
    }
    log_info!(
        "clean_temp: removidos={} ignorados={} erros={}",
        tally.removed,
        tally.skipped,
        tally.errors.len()
    );

    let error = (!tally.errors.is_empty()).then(|| {
        let mut shown: Vec<String> = tally.errors.iter().take(20).cloned().collect();
        if tally.errors.len() > shown.len() {
            shown.push(format!("… e mais {}", tally.errors.len() - shown.len()));
        }
        shown.join("\n")
    });
    Ok(CommandResult {
        success: tally.errors.is_empty(),
        output,
        error,
    })
}

#[derive(Default)]
struct CleanTally {
    removed: usize,
    /// Em uso (ERROR_SHARING_VIOLATION) ou protegido (acesso negado): esperado.
    skipped: usize,
    /// Falhas inesperadas, mostradas ao técnico.
    errors: Vec<String>,
}

/// Apaga o conteúdo de `dir` (não a pasta). Antes, qualquer erro era ignorado
/// e o resultado dizia "sucesso" mesmo sem limpar nada.
fn clean_dir(dir: &Path, tally: &mut CleanTally) {
    if !dir.exists() {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => {
            tally.errors.push(format!("{}: {}", dir.display(), e));
            return;
        }
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let result = if path.is_dir() {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_file(&path)
        };
        match result {
            Ok(()) => tally.removed += 1,
            // 32 = arquivo em uso; 5 = acesso negado (arquivo de sistema/serviço).
            Err(e) if matches!(e.raw_os_error(), Some(32) | Some(5)) => tally.skipped += 1,
            Err(e) => tally.errors.push(format!("{}: {}", path.display(), e)),
        }
    }
}

fn restart_spooler() -> Result<CommandResult, String> {
    // Stop spooler service
    let stop_result = run_cmd_command("net stop spooler")?;

    // Clear print queue (sem o stop, os arquivos da fila continuam travados).
    let clear_result = run_cmd_command("del /Q /F %systemroot%\\System32\\spool\\PRINTERS\\*")?;

    // Start spooler service
    let start_result = run_cmd_command("net start spooler")?;

    let status = |r: &CommandResult| if r.success { "ok" } else { "FALHOU" };
    let errors: Vec<String> = [
        ("parar", &stop_result),
        ("limpar fila", &clear_result),
        ("iniciar", &start_result),
    ]
    .iter()
    .filter(|(_, r)| !r.success)
    .map(|(step, r)| format!("{step}: {}", r.error.as_deref().unwrap_or(r.output.trim())))
    .collect();

    Ok(CommandResult {
        // O que importa no fim é o serviço de pé; falha em parar/limpar vira aviso.
        success: start_result.success,
        output: format!(
            "Spooler: parar {} · limpar fila {} · iniciar {}\n{}",
            status(&stop_result),
            status(&clear_result),
            status(&start_result),
            start_result.output.trim()
        ),
        error: (!errors.is_empty()).then(|| errors.join("\n")),
    })
}

fn run_gpupdate() -> Result<CommandResult, String> {
    run_cmd_command("gpupdate /force")
}

fn run_dism_health() -> Result<CommandResult, String> {
    run_cmd_command("DISM /Online /Cleanup-Image /CheckHealth")
}

fn run_sfc_scan() -> Result<CommandResult, String> {
    run_cmd_command("sfc /scannow")
}

fn open_device_manager() -> Result<CommandResult, String> {
    let _ = Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/C", "start", "devmgmt.msc"])
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(CommandResult {
        success: true,
        output: "Gerenciador de Dispositivos aberto".to_string(),
        error: None,
    })
}

fn generate_battery_report() -> Result<CommandResult, String> {
    let report_path = format!(
        "{}\\Documents\\battery-report.html",
        std::env::var("USERPROFILE").unwrap_or_default()
    );

    let result = run_cmd_command(&format!(
        "powercfg /batteryreport /output \"{}\"",
        report_path
    ))?;

    if result.success {
        // Open the report
        let _ = Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/C", "start", &report_path])
            .spawn();
    }

    Ok(CommandResult {
        success: result.success,
        output: format!("Relatório de bateria gerado em: {}", report_path),
        error: result.error,
    })
}

fn restart_services() -> Result<CommandResult, String> {
    // Common services that might need restart
    let services = ["wuauserv", "BITS", "CryptSvc"];
    let mut results: Vec<String> = Vec::new();

    let mut failures: Vec<String> = Vec::new();

    for service in services {
        // "net stop" falha se o serviço já estava parado — não é erro; o que
        // conta é ele subir de novo.
        let stop = run_cmd_command(&format!("net stop {}", service))?;
        let start = run_cmd_command(&format!("net start {}", service))?;

        if start.success {
            let note = if stop.success {
                ""
            } else {
                " (já estava parado)"
            };
            results.push(format!("{}: reiniciado{}", service, note));
        } else {
            results.push(format!("{}: FALHOU ao iniciar", service));
            failures.push(format!(
                "{}: {}",
                service,
                start.error.as_deref().unwrap_or(start.output.trim())
            ));
        }
    }

    Ok(CommandResult {
        success: failures.is_empty(),
        output: results.join("\n"),
        error: (!failures.is_empty()).then(|| failures.join("\n")),
    })
}

fn repair_office() -> Result<CommandResult, String> {
    let office_path =
        r"C:\Program Files\Common Files\microsoft shared\ClickToRun\OfficeClickToRun.exe";
    if !Path::new(office_path).exists() {
        return Ok(CommandResult {
            success: false,
            output: "Office Click-to-Run não encontrado.".to_string(),
            error: None,
        });
    }
    Command::new(office_path)
        .creation_flags(CREATE_NO_WINDOW)
        .args(["scenario=Repair", "platform=x64", "culture=pt-br"])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(CommandResult {
        success: true,
        output: "Reparo do Office iniciado.".to_string(),
        error: None,
    })
}

fn open_tool(tool: &str) -> Result<CommandResult, String> {
    Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/C", "start", tool])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(CommandResult {
        success: true,
        output: format!("Abrindo {}...", tool),
        error: None,
    })
}

#[tauri::command]
pub async fn run_maintenance(
    task: String,
    sessions: State<'_, SessionsState>,
) -> ApiResult<CommandResult> {
    require_valid_session(&sessions).await?;
    let task_label = sanitize_log_label(&task);
    // SFC/DISM levam minutos: rodar no pool bloqueante evita travar o runtime async.
    let result = tokio::task::spawn_blocking(move || dispatch_maintenance(&task))
        .await
        .unwrap_or_else(|e| Err(format!("Tarefa interrompida: {}", e)));
    result.map_err(|e| ApiError::maintenance_error(&task_label).with_details(&e))
}

fn dispatch_maintenance(task: &str) -> Result<CommandResult, String> {
    match task {
        "clean_temp" => clean_temp_files(),
        "restart_spooler" => restart_spooler(),
        "gpupdate" => run_gpupdate(),
        "dism_health" => run_dism_health(),
        "sfc_scan" => run_sfc_scan(),
        "device_manager" => open_device_manager(),
        "battery_report" => generate_battery_report(),
        "restart_services" => restart_services(),
        "repair_office" => repair_office(),
        "winsock_reset" => run_cmd_command("netsh winsock reset"),
        "restart_explorer" => run_cmd_command("taskkill /F /IM explorer.exe & start explorer.exe"),
        "restore_point" => run_cmd_command(
            "powershell -Command \"Checkpoint-Computer -Description 'GTI Toolkit' -RestorePointType MODIFY_SETTINGS\"",
        ),
        "open_msra"     => open_tool("msra"),
        "open_eventvwr" => open_tool("eventvwr"),
        "open_services" => open_tool("services.msc"),
        "open_msconfig" => open_tool("msconfig"),
        "open_compmgmt" => open_tool("compmgmt.msc"),
        "open_taskschd" => open_tool("taskschd.msc"),
        "open_lusrmgr" => open_tool("lusrmgr.msc"),
        _ => Err(format!(
            "Unknown maintenance task: {}",
            sanitize_log_label(task)
        )),
    }
}

#[tauri::command]
pub async fn run_tool_with_target(
    task: String,
    target: String,
    sessions: State<'_, SessionsState>,
) -> ApiResult<CommandResult> {
    require_valid_session(&sessions).await?;
    let result: Result<CommandResult, String> = match task.as_str() {
        "nslookup" => match validate_host_target(&target) {
            Ok(safe_target) => run_cmd_command(&format!("nslookup {}", safe_target)),
            Err(e) => Err(e),
        },
        "rdp" => match validate_host_target(&target) {
            Ok(safe_target) => {
                Command::new(msra_path())
                    .creation_flags(CREATE_NO_WINDOW)
                    .args(["/offerra", &safe_target])
                    .spawn()?;
                Ok(CommandResult {
                    success: true,
                    output: format!("Oferecendo assistência remota a {}...", safe_target),
                    error: None,
                })
            }
            Err(e) => Err(e),
        },
        _ => Err(format!("Unknown tool: {}", sanitize_log_label(&task))),
    };
    result.map_err(|e| ApiError::command_failed(&sanitize_log_label(&task)).with_details(&e))
}

/// Long-running commands that stream output line-by-line via Tauri events.
/// Emits both "command-output" (history log) and "network-output" (terminal modal).
/// Output is decoded by `console_text` (OEM / UTF-16LE — `chcp` has no effect
/// without a console); stderr is merged so failures show up in the modal.
#[tauri::command]
pub async fn run_command_streaming(
    app: tauri::AppHandle,
    task: String,
    sessions: State<'_, SessionsState>,
) -> ApiResult<()> {
    require_valid_session(&sessions).await?;

    let cmd_str = match task.as_str() {
        "dism_health" => "DISM /Online /Cleanup-Image /CheckHealth 2>&1",
        "sfc_scan" => "sfc /scannow 2>&1",
        "gpupdate" => "gpupdate /force 2>&1",
        _ => {
            return Err(ApiError::command_failed(&format!(
                "streaming: {}",
                sanitize_log_label(&task)
            )))
        }
    };

    let mut child = Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/C", cmd_str])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;

    // Leitura bloqueante (SFC leva minutos): fora das threads do runtime async.
    let stdout = child.stdout.take();
    let app_out = app.clone();
    let status = tauri::async_runtime::spawn_blocking(move || {
        if let Some(stdout) = stdout {
            console_text::for_each_line(stdout, |line| {
                // Feed both the history log and the terminal modal
                let _ = app_out.emit("command-output", &line);
                let _ = app_out.emit("network-output", &line);
                true
            });
        }
        child.wait()
    })
    .await
    .map_err(|e| ApiError::internal_error().with_details(&e.to_string()))?;

    if let Ok(status) = &status {
        if !status.success() {
            let msg = format!(
                "✗ Comando terminou com código {}",
                status.code().unwrap_or(-1)
            );
            let _ = app.emit("network-output", &msg);
        }
    }
    // Signal modal that streaming is done
    let _ = app.emit("network-done", true);
    status?;
    Ok(())
}
