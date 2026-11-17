use crate::infra::windows::CREATE_NO_WINDOW;
use crate::logging::is_access_denied;

#[cfg(windows)]
use tauri::Manager;

#[cfg(windows)]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

/// Log Windows privilege information at startup
pub fn log_startup_diagnostics() {
    log_info!("=== STARTUP DIAGNOSTICS ===");

    log_debug!("Environment variables:");
    if let Ok(val) = std::env::var("USERNAME") {
        log_debug!("  USERNAME = {}", val);
    }
    if let Ok(val) = std::env::var("COMPUTERNAME") {
        log_debug!("  COMPUTERNAME = {}", val);
    }
    if let Ok(val) = std::env::var("USERPROFILE") {
        log_debug!("  USERPROFILE = {}", val);
    }
    if let Ok(val) = std::env::var("TEMP") {
        log_debug!("  TEMP = {}", val);
    }
    if let Ok(val) = std::env::var("APPDATA") {
        log_debug!("  APPDATA = {}", val);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        log_debug!("Checking Administrator privileges...");

        match std::process::Command::new("whoami")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/groups"])
            .output()
        {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let is_admin = stdout.contains("S-1-16-12288")
                    || stdout.contains("Mandatory Label\\High Mandatory Level");
                log_debug!("whoami /groups result:");
                for line in stdout.lines().take(20) {
                    log_debug!("  {}", line);
                }
                log_info!("Running as Administrator: {}", is_admin);

                if stdout.contains("S-1-16-12288") {
                    log_debug!("  -> High Mandatory Level (Administrator)");
                } else if stdout.contains("S-1-16-8192") {
                    log_debug!("  -> Medium Mandatory Level (Standard User)");
                } else if stdout.contains("S-1-16-4096") {
                    log_debug!("  -> Low Mandatory Level (Restricted)");
                }
            }
            Err(e) => {
                log_warn!(
                    "Failed to run whoami /groups: {} (OS Error: {:?})",
                    e,
                    e.raw_os_error()
                );
            }
        }

        log_debug!("Testing registry access (requires admin)...");
        match std::process::Command::new("reg")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "query",
                "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
            ])
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    log_debug!("Registry access: SUCCESS (likely admin)");
                } else {
                    log_debug!("Registry access: FAILED (likely not admin)");
                }
            }
            Err(e) => {
                log_warn!(
                    "Registry query failed: {} (OS Error: {:?})",
                    e,
                    e.raw_os_error()
                );
            }
        }
    }

    #[cfg(not(windows))]
    {
        log_debug!("Not running on Windows - skipping Windows-specific checks");
    }

    log_info!("=== END STARTUP DIAGNOSTICS ===");
}

/// Check firewall status and rules for the configured chat port
pub fn check_firewall_status(port: u16) {
    log_info!("=== FIREWALL STATUS CHECK ===");

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        log_debug!("Checking firewall current profile...");
        match std::process::Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["advfirewall", "show", "currentprofile"])
            .output()
        {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                log_debug!("Firewall profile output:");
                for line in stdout.lines().take(15) {
                    log_debug!("  {}", line);
                }

                if stdout.contains("State                                 ON") {
                    log_warn!("Windows Firewall is ON - may block connections");
                } else {
                    log_info!("Windows Firewall is OFF or unknown state");
                }
            }
            Err(e) => {
                log_error!(
                    "Failed to check firewall status: {} (OS Error: {:?})",
                    e,
                    e.raw_os_error()
                );
                if is_access_denied(&e) {
                    log_error!("*** OS ERROR 5: ACCESS DENIED checking firewall ***");
                }
            }
        }

        let rule_name = format!("Toolkit GTI Chat WS {}", port);
        log_debug!("Checking if firewall rule '{}' exists...", rule_name);
        match std::process::Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "advfirewall",
                "firewall",
                "show",
                "rule",
                &format!("name={}", rule_name),
            ])
            .output()
        {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if stdout.contains(&rule_name) {
                    log_info!("Firewall rule '{}' EXISTS", rule_name);
                    for line in stdout.lines() {
                        log_debug!("  {}", line);
                    }
                } else {
                    log_warn!("Firewall rule '{}' DOES NOT EXIST", rule_name);
                }
            }
            Err(e) => {
                log_error!(
                    "Failed to check firewall rule: {} (OS Error: {:?})",
                    e,
                    e.raw_os_error()
                );
            }
        }

        log_debug!("Checking all rules for port {}...", port);
        match std::process::Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "advfirewall",
                "firewall",
                "show",
                "rule",
                "name=all",
                "dir=in",
            ])
            .output()
        {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let port_str = port.to_string();
                let relevant: Vec<&str> = stdout
                    .lines()
                    .filter(|l| l.contains(&port_str) || l.contains("Toolkit GTI Chat WS"))
                    .collect();
                if relevant.is_empty() {
                    log_debug!("No existing rules found for port {}", port);
                } else {
                    log_debug!("Found rules mentioning {} or Toolkit:", port);
                    for line in relevant {
                        log_debug!("  {}", line);
                    }
                }
            }
            Err(e) => {
                log_error!(
                    "Failed to list firewall rules: {} (OS Error: {:?})",
                    e,
                    e.raw_os_error()
                );
            }
        }
    }

    log_info!("=== END FIREWALL STATUS CHECK ===");
}

/// Check if the configured port is available
pub fn check_port_availability(port: u16) {
    use std::net::TcpListener;

    log_info!("=== PORT AVAILABILITY CHECK ===");

    log_debug!("Testing bind to 127.0.0.1:{}...", port);
    match TcpListener::bind(format!("127.0.0.1:{}", port)) {
        Ok(listener) => {
            log_info!("Port {} on 127.0.0.1 is AVAILABLE", port);
            drop(listener);
        }
        Err(e) => {
            log_error!(
                "Port {} on 127.0.0.1 is BLOCKED: {} (OS Error: {:?})",
                port,
                e,
                e.raw_os_error()
            );
            if is_access_denied(&e) {
                log_error!("*** OS ERROR 5: ACCESS DENIED on port bind ***");
            }
        }
    }

    log_debug!("Testing bind to 0.0.0.0:{}...", port);
    match TcpListener::bind(format!("0.0.0.0:{}", port)) {
        Ok(listener) => {
            log_info!("Port {} on 0.0.0.0 is AVAILABLE", port);
            drop(listener);
        }
        Err(e) => {
            log_error!(
                "Port {} on 0.0.0.0 is BLOCKED: {} (OS Error: {:?})",
                port,
                e,
                e.raw_os_error()
            );
            if is_access_denied(&e) {
                log_error!("*** OS ERROR 5: ACCESS DENIED on port bind ***");
            }
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        log_debug!("Checking what process is using port {}...", port);
        match std::process::Command::new("netstat")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["-ano", "-p", "TCP"])
            .output()
        {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let port_token = format!(":{}", port);
                let relevant: Vec<&str> =
                    stdout.lines().filter(|l| l.contains(&port_token)).collect();
                if relevant.is_empty() {
                    log_debug!("No process found using port {}", port);
                } else {
                    log_warn!("Port {} is in use:", port);
                    for line in relevant {
                        log_warn!("  {}", line);
                    }
                }
            }
            Err(e) => {
                log_error!(
                    "Failed to run netstat: {} (OS Error: {:?})",
                    e,
                    e.raw_os_error()
                );
            }
        }
    }

    log_info!("=== END PORT AVAILABILITY CHECK ===");
}

/// Argumento que o MSI grava no `HKLM\...\Run` (ver `wix/firewall.wxs`).
pub const AUTOSTART_ARG: &str = "--autostart";

/// Nome do valor antigo em `HKCU\...\Run` (versões até a 1.3.7).
#[cfg(windows)]
const LEGACY_RUN_VALUE: &str = "ToolkitGTI";

/// O início automático agora é do MSI (`HKLM\...\Run`, todos os usuários).
/// Aqui só (1) remove a entrada antiga em `HKCU`, que abria o app duas vezes,
/// e (2) quando o app subiu pelo logon, esconde a janela: o usuário fica só
/// com a bandeja e o chat.
#[cfg(windows)]
pub fn configure_windows_startup(app: &tauri::AppHandle) {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(run_key) = hkcu.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Run",
        winreg::enums::KEY_READ | winreg::enums::KEY_SET_VALUE,
    ) {
        if run_key.get_raw_value(LEGACY_RUN_VALUE).is_ok() {
            match run_key.delete_value(LEGACY_RUN_VALUE) {
                Ok(()) => log_info!("Entrada antiga de início automático (HKCU Run) removida"),
                Err(e) => log_warn!("Falha ao remover HKCU Run antigo: {}", e),
            }
        }
    }

    if std::env::args().any(|arg| arg == AUTOSTART_ARG) {
        if let Some(main_window) = app.get_webview_window("main") {
            match main_window.hide() {
                Ok(()) => log_info!("Início pelo logon: janela oculta, só bandeja e chat"),
                Err(e) => log_warn!("Falha ao ocultar janela no início pelo logon: {}", e),
            }
        }
    }
}

#[cfg(not(windows))]
pub fn configure_windows_startup(_app: &tauri::AppHandle) {}
