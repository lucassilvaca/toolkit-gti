use crate::domain::system::{get_network_info, get_public_ip_info};
use crate::domain::system::{DynamicInfo, StaticInfo, SystemMonitor};
use crate::error_handling::{ApiError, ApiResult};
use crate::infra::windows::CREATE_NO_WINDOW;
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::Arc;
use sysinfo::{Disks, System};
use tauri::State;
use winreg::enums::*;
use winreg::RegKey;

/// Legacy struct for backward compatibility
#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub username: String,
    pub hostname: String,
    #[serde(rename = "osVersion")]
    pub os_version: String,
    pub uptime: String,
    #[serde(rename = "cpuUsage")]
    pub cpu_usage: f32,
    #[serde(rename = "memoryUsage")]
    pub memory_usage: f32,
    #[serde(rename = "diskFree")]
    pub disk_free: String,
    #[serde(rename = "diskHealth")]
    pub disk_health: String,
    /// % usado do disco do sistema; -1 quando indisponível.
    #[serde(rename = "diskUsedPercent")]
    pub disk_used_percent: f32,
    #[serde(rename = "localIp")]
    pub local_ip: String,
    #[serde(rename = "publicIp")]
    pub public_ip: String,
    #[serde(rename = "macAddress")]
    pub mac_address: String,
    pub gateway: String,
    #[serde(rename = "dnsServer")]
    pub dns_server: String,
    #[serde(rename = "antivirusStatus")]
    pub antivirus_status: String,
    #[serde(rename = "firewallStatus")]
    pub firewall_status: String,
    #[serde(rename = "updateStatus")]
    pub update_status: String,
    #[serde(rename = "lastScan")]
    pub last_scan: String,
}

fn format_bytes(bytes: u64) -> String {
    const GB: u64 = 1024 * 1024 * 1024;
    const MB: u64 = 1024 * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    }
}

/// Normaliza a saida de `ConvertTo-Json` do PowerShell, que emite um objeto
/// "pelado" para um unico item e um array para varios. Sempre devolve um slice
/// iteravel — evitando o padrao `is_array().unwrap()` (panico latente) que
/// estava duplicado em `get_processor_info` e `get_services`.
fn json_rows(value: &serde_json::Value) -> Vec<&serde_json::Value> {
    match value.as_array() {
        Some(arr) => arr.iter().collect(),
        None => vec![value],
    }
}

fn get_firewall_status() -> String {
    // netsh advfirewall is a native Windows exe — no external crates needed
    let output = Command::new("netsh")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["advfirewall", "show", "allprofiles", "state"])
        .output();

    match output {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            let active = text.lines().any(|line| {
                let l = line.trim().to_lowercase();
                l.starts_with("state") && l.contains("on")
            });
            if active { "Ativo" } else { "Inativo" }.to_string()
        }
        Err(_) => "Desconhecido".to_string(),
    }
}

fn get_antivirus_status() -> String {
    // Check Windows Defender real-time protection via registry (fast, no WMI)
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey(r"SOFTWARE\Microsoft\Windows Defender\Real-Time Protection") {
        let disabled: u32 = key.get_value("DisableRealtimeMonitoring").unwrap_or(0);
        return if disabled == 0 { "Ativo" } else { "Inativo" }.to_string();
    }
    // Key absent means Defender is in default active state
    "Ativo".to_string()
}

fn get_serial_number() -> String {
    // BIOS serial via PowerShell CimInstance (uses CIM, not the Rust wmi crate)
    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance -ClassName Win32_BIOS).SerialNumber",
        ])
        .output();

    match output {
        Ok(out) => {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let sl = s.to_lowercase();
            if s.is_empty()
                || sl == "to be filled by o.e.m."
                || sl == "default string"
                || sl == "none"
            {
                "N/A".to_string()
            } else {
                s
            }
        }
        Err(_) => "N/A".to_string(),
    }
}

fn get_os_build() -> String {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion") {
        let product: String = key.get_value("ProductName").unwrap_or_default();
        let build: String = key.get_value("CurrentBuild").unwrap_or_default();
        let ubr: u32 = key.get_value("UBR").unwrap_or(0);

        if !product.is_empty() && !build.is_empty() {
            return format!("{} (Build {}.{})", product, build, ubr);
        }
    }
    "N/A".to_string()
}

fn get_bitlocker_status() -> String {
    // PowerShell Get-BitLockerVolume returns "On"/"Off" regardless of locale
    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-Command",
            "try { (Get-BitLockerVolume -MountPoint 'C:').ProtectionStatus } catch { 'Error' }",
        ])
        .output();

    match output {
        Ok(out) => {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            match s.as_str() {
                "On" => "Ativo".to_string(),
                "Off" => "Inativo".to_string(),
                _ => "Desconhecido".to_string(),
            }
        }
        Err(_) => "Não Disponível".to_string(),
    }
}

fn get_recent_bsod() -> String {
    // Use wevtutil.exe (native Windows tool) which is much faster than PowerShell
    let output = Command::new("wevtutil")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "qe",
            "System",
            "/q:*[System[Provider[@Name='Microsoft-Windows-WER-SystemErrorReporting'] and (EventID=1001)]]",
            "/c:1",
            "/rd:true",
            "/f:text",
        ])
        .output();

    match output {
        Ok(out) => {
            let result = String::from_utf8_lossy(&out.stdout);
            if result.contains("Date:") || result.contains("TimeCreated") {
                // Extract date from output if possible
                for line in result.lines() {
                    if line.trim().starts_with("Date:") {
                        let date_part = line.trim().trim_start_matches("Date:").trim();
                        // Format: 2024-01-15T10:30:00.000
                        if let Some(date_str) = date_part.split('T').next() {
                            if let Ok(date) =
                                chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
                            {
                                return format!("Sim ({})", date.format("%d/%m/%Y"));
                            }
                        }
                        return "Sim (verificar logs)".to_string();
                    }
                }
                "Sim (verificar logs)".to_string()
            } else {
                "Nenhum".to_string()
            }
        }
        Err(_) => "Nenhum".to_string(),
    }
}

fn get_update_status() -> String {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let path =
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired";
    if hklm.open_subkey(path).is_ok() {
        "Reiniciar Pendente".to_string()
    } else {
        "Em dia".to_string()
    }
}

/// Get dynamic info from the persistent monitor (lightweight, called by events)
#[tauri::command]
pub fn is_admin() -> bool {
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags("SYSTEM", KEY_WRITE)
        .is_ok()
}

#[tauri::command]
pub async fn get_dynamic_info(monitor: State<'_, Arc<SystemMonitor>>) -> ApiResult<DynamicInfo> {
    // get_dynamic_info() does two CPU refreshes with a 200ms gap internally (blocking),
    // so we run it on a blocking thread to avoid stalling the async runtime.
    let monitor = monitor.inner().clone();
    tokio::task::spawn_blocking(move || monitor.get_dynamic_info())
        .await
        .map_err(|e| ApiError::internal_error().with_details(&format!("Task failed: {}", e)))?
        .map_err(|e| ApiError::internal_error().with_details(&e))
}

/// % usado de um volume; -1 quando o total é desconhecido (0 bytes).
fn used_percent(total: u64, available: u64) -> f32 {
    if total == 0 {
        return -1.0;
    }
    (((total - available.min(total)) as f64 / total as f64) * 100.0) as f32
}

/// Espaço livre, saúde e % usado do disco do SISTEMA (o volume do
/// `%SystemDrive%`, normalmente `C:\`), e não simplesmente o primeiro da lista.
fn system_disk_summary() -> (String, String, f32) {
    let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
    let disks = Disks::new_with_refreshed_list();
    let disk = disks
        .list()
        .iter()
        .find(|d| {
            d.mount_point()
                .to_string_lossy()
                .to_ascii_uppercase()
                .starts_with(&system_drive.to_ascii_uppercase())
        })
        .or_else(|| disks.list().first());
    match disk {
        Some(disk) => {
            let total = disk.total_space();
            let available = disk.available_space();
            (
                format_bytes(available),
                "Saudavel".to_string(),
                used_percent(total, available),
            )
        }
        None => ("N/A".to_string(), "Desconhecido".to_string(), -1.0),
    }
}

/// Coleta toda a informacao estatica que depende de chamadas BLOQUEANTES:
/// leitura do registro, PowerShell, netsh, wevtutil e enumeracao de discos.
///
/// Os campos `public_ip`/`isp` ficam vazios aqui — sao preenchidos pelo chamador
/// async (`get_static_info`), pois vem de uma chamada de rede assincrona.
fn collect_static_info_blocking() -> StaticInfo {
    // Native Windows API (single call, no PowerShell)
    let network_info = get_network_info();

    let connection_type = if network_info.dhcp_enabled {
        "Dinamico (DHCP)".to_string()
    } else {
        "Estatico".to_string()
    };

    let os_version = format!(
        "{} {}",
        System::name().unwrap_or_else(|| "Windows".to_string()),
        System::os_version().unwrap_or_default()
    );

    let (disk_free, disk_health, disk_used_percent) = system_disk_summary();

    StaticInfo {
        username: std::env::var("USERNAME").unwrap_or_else(|_| "N/A".to_string()),
        hostname: System::host_name().unwrap_or_else(|| "N/A".to_string()),
        serial_number: get_serial_number(),
        os_version,
        os_build: get_os_build(),
        disk_free,
        disk_health,
        disk_used_percent,
        local_ip: network_info.local_ip,
        public_ip: String::new(), // preenchido pelo chamador async
        isp: String::new(),       // preenchido pelo chamador async
        connection_type,
        mac_address: network_info.mac_address,
        gateway: network_info.gateway,
        dns_server: network_info.dns_server,
        antivirus_status: get_antivirus_status(),
        firewall_status: get_firewall_status(),
        bitlocker_status: get_bitlocker_status(),
        recent_bsod: get_recent_bsod(),
        update_status: get_update_status(),
        last_scan: chrono::Local::now().format("%d/%m/%Y").to_string(),
    }
}

/// Get static info - called once on startup and on manual refresh
#[tauri::command]
pub async fn get_static_info() -> ApiResult<StaticInfo> {
    // A chamada de rede (IP publico/ISP) permanece no runtime async.
    let public_ip_info = get_public_ip_info().await;

    // Todo o resto e bloqueante (registro, PowerShell, netsh, wevtutil, discos).
    // Rodar em thread dedicada evita travar o runtime async do Tauri durante o
    // carregamento do dashboard.
    let info = tokio::task::spawn_blocking(collect_static_info_blocking)
        .await
        .map_err(|e| ApiError::internal_error().with_details(&format!("Task failed: {}", e)))?;

    Ok(StaticInfo {
        public_ip: public_ip_info.ip,
        isp: public_ip_info.isp,
        ..info
    })
}

/// Legacy command for backward compatibility - combines static and dynamic
#[tauri::command]
pub async fn get_system_info(monitor: State<'_, Arc<SystemMonitor>>) -> ApiResult<SystemInfo> {
    let monitor_clone = monitor.inner().clone();
    let dynamic = tokio::task::spawn_blocking(move || monitor_clone.get_dynamic_info())
        .await
        .map_err(|e| ApiError::internal_error().with_details(&format!("Task failed: {}", e)))?
        .map_err(|e| ApiError::internal_error().with_details(&e))?;
    let static_info = get_static_info().await?;

    Ok(SystemInfo {
        username: static_info.username,
        hostname: static_info.hostname,
        os_version: static_info.os_version,
        uptime: dynamic.uptime,
        cpu_usage: dynamic.cpu_usage,
        memory_usage: dynamic.memory_usage,
        disk_free: static_info.disk_free,
        disk_health: static_info.disk_health,
        disk_used_percent: static_info.disk_used_percent,
        local_ip: static_info.local_ip,
        public_ip: static_info.public_ip,
        mac_address: static_info.mac_address,
        gateway: static_info.gateway,
        dns_server: static_info.dns_server,
        antivirus_status: static_info.antivirus_status,
        firewall_status: static_info.firewall_status,
        update_status: static_info.update_status,
        last_scan: static_info.last_scan,
    })
}

/// Um volume montado, no formato esperado por `useDiskList.ts`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub mount_point: String,
    pub name: String,
    pub total_label: String,
    pub free_label: String,
    /// Percentual de uso (0-100). -1 quando o total é desconhecido.
    pub used_percent: f32,
    pub is_removable: bool,
    pub file_system: String,
}

/// Lista os volumes montados (aba de discos do dashboard).
#[tauri::command]
pub async fn list_disks() -> ApiResult<Vec<DiskInfo>> {
    tokio::task::spawn_blocking(|| {
        Disks::new_with_refreshed_list()
            .list()
            .iter()
            .map(|d| {
                let total = d.total_space();
                let free = d.available_space();
                DiskInfo {
                    mount_point: d.mount_point().to_string_lossy().to_string(),
                    name: d.name().to_string_lossy().to_string(),
                    total_label: format_bytes(total),
                    free_label: format_bytes(free),
                    used_percent: used_percent(total, free),
                    is_removable: d.is_removable(),
                    file_system: d.file_system().to_string_lossy().to_string(),
                }
            })
            .collect()
    })
    .await
    .map_err(|e| ApiError::internal_error().with_details(&format!("Task failed: {}", e)))
}

// ═══════════════════════════════════════════════════════════════════════════════════
// NOVAS FUNCIONALIDADES SOLICITADAS
// ═══════════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessorInfo {
    pub name: String,
    pub cores: u32,
    pub threads: u32,
    pub speed: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServiceInfo {
    pub name: String,
    pub display_name: String,
    pub status: String,
    pub start_type: String,
}

/// Get detailed processor information
#[tauri::command(async)]
pub fn get_processor_info() -> ApiResult<Vec<ProcessorInfo>> {
    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance -ClassName Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed | ConvertTo-Json"
        ])
        .output()
        .map_err(|e| ApiError::command_failed("processor_info").with_details(&e.to_string()))?;

    if !output.status.success() {
        return Err(ApiError::command_failed("processor_info"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Parse JSON response
    let json_value: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| ApiError::command_failed("json_parse").with_details(&e.to_string()))?;

    let result: Vec<ProcessorInfo> = json_rows(&json_value)
        .into_iter()
        .map(|proc| {
            let speed_mhz = proc
                .get("MaxClockSpeed")
                .and_then(|s| s.as_u64())
                .unwrap_or(0);
            ProcessorInfo {
                name: proc
                    .get("Name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("Desconhecido")
                    .trim()
                    .to_string(),
                cores: proc
                    .get("NumberOfCores")
                    .and_then(|c| c.as_u64())
                    .unwrap_or(0) as u32,
                threads: proc
                    .get("NumberOfLogicalProcessors")
                    .and_then(|t| t.as_u64())
                    .unwrap_or(0) as u32,
                speed: if speed_mhz > 1000 {
                    format!("{:.2} GHz", speed_mhz as f64 / 1000.0)
                } else {
                    format!("{} MHz", speed_mhz)
                },
            }
        })
        .collect();

    Ok(result)
}

/// Get detailed antivirus information (brand detection)
#[tauri::command(async)]
pub fn get_antivirus_details() -> ApiResult<String> {
    // First try Windows Security Center
    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | Select-Object displayName | ConvertTo-Json"
        ])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&stdout) {
                if let Some(products) = json_value.as_array() {
                    let names: Vec<String> = products
                        .iter()
                        .filter_map(|p| p.get("displayName")?.as_str())
                        .map(|s| s.to_string())
                        .collect();

                    if !names.is_empty() {
                        return Ok(names.join(", "));
                    }
                } else if let Some(name) = json_value.get("displayName").and_then(|n| n.as_str()) {
                    return Ok(name.to_string());
                }
            }
        }
    }

    // Fallback: Check for common antivirus processes
    let common_av = vec![
        ("MsMpEng.exe", "Windows Defender"),
        ("avp.exe", "Kaspersky"),
        ("avgnt.exe", "Avira"),
        ("mbam.exe", "Malwarebytes"),
        ("nod32krn.exe", "ESET NOD32"),
        ("McShield.exe", "McAfee"),
        ("NortonSecurity.exe", "Norton"),
        ("avastUI.exe", "Avast"),
        ("avgui.exe", "AVG"),
    ];

    let output = Command::new("tasklist")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/FO", "CSV"])
        .output();

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for (process, name) in common_av {
            if stdout.contains(process) {
                return Ok(name.to_string());
            }
        }
    }

    Ok("Windows Defender".to_string()) // Default fallback
}

/// Get Windows services (requires admin)
#[tauri::command(async)]
pub fn get_services() -> ApiResult<Vec<ServiceInfo>> {
    if !is_admin() {
        return Err(ApiError::permission_denied());
    }

    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-Command",
            "Get-Service | Select-Object Name, DisplayName, Status | ConvertTo-Json",
        ])
        .output()
        .map_err(|e| ApiError::command_failed("services").with_details(&e.to_string()))?;

    if !output.status.success() {
        return Err(ApiError::command_failed("services"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let json_value: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| ApiError::command_failed("json_parse").with_details(&e.to_string()))?;

    let result: Vec<ServiceInfo> = json_rows(&json_value)
        .into_iter()
        .map(|service| ServiceInfo {
            name: service
                .get("Name")
                .and_then(|n| n.as_str())
                .unwrap_or("Desconhecido")
                .to_string(),
            display_name: service
                .get("DisplayName")
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_string(),
            status: service
                .get("Status")
                .and_then(|s| s.as_str())
                .unwrap_or("Desconhecido")
                .to_string(),
            start_type: "N/A".to_string(), // Could be enhanced later
        })
        .collect();

    Ok(result)
}

/// Get last update date
#[tauri::command(async)]
pub fn get_last_update_date() -> ApiResult<String> {
    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-Command",
            "try { $hotfix = Get-HotFix | Where-Object { $_.InstalledOn -ne $null } | Sort-Object InstalledOn -Descending | Select-Object -First 1; if ($null -eq $hotfix) { $hotfix = Get-CimInstance Win32_QuickFixEngineering | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1 }; if ($null -ne $hotfix -and $null -ne $hotfix.InstalledOn) { ([datetime]$hotfix.InstalledOn).ToString('dd/MM/yyyy') } else { $lastSuccess = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\WindowsUpdate\\Auto Update\\Results\\Install' -Name LastSuccessTime -ErrorAction SilentlyContinue).LastSuccessTime; if ([string]::IsNullOrWhiteSpace($lastSuccess)) { 'Data não disponível' } else { ([datetime]$lastSuccess).ToString('dd/MM/yyyy') } } } catch { 'Data não disponível' }"
        ])
        .output()
        .map_err(|e| ApiError::command_failed("last_update_date").with_details(&e.to_string()))?;

    if !output.status.success() {
        return Err(ApiError::command_failed("last_update_date"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed = stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("Data não disponível");

    if parsed.eq_ignore_ascii_case("Data não disponível") {
        Ok("Data não disponível".to_string())
    } else {
        Ok(parsed.to_string())
    }
}

/// Open Windows Task Manager
#[tauri::command]
pub fn open_task_manager() -> ApiResult<String> {
    Command::new("taskmgr")
        .spawn()
        .map_err(|e| ApiError::command_failed("task_manager").with_details(&e.to_string()))?;

    Ok("Task Manager opened successfully".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn used_percent_retorna_menos_um_sem_total() {
        assert_eq!(used_percent(0, 0), -1.0);
        assert_eq!(used_percent(100, 25), 75.0);
        assert_eq!(used_percent(100, 500), 0.0);
    }

    #[test]
    fn format_bytes_usa_gb_acima_de_1gb() {
        assert_eq!(format_bytes(2 * 1024 * 1024 * 1024), "2.0 GB");
    }

    #[test]
    fn format_bytes_usa_mb_abaixo_de_1gb() {
        assert_eq!(format_bytes(512 * 1024 * 1024), "512.0 MB");
    }

    #[test]
    fn json_rows_envelopa_objeto_unico() {
        let single = json!({ "Name": "CPU0" });
        let rows = json_rows(&single);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["Name"], "CPU0");
    }

    #[test]
    fn json_rows_preserva_array() {
        let many = json!([{ "Name": "CPU0" }, { "Name": "CPU1" }]);
        let rows = json_rows(&many);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1]["Name"], "CPU1");
    }
}
