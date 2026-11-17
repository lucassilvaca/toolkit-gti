use crate::infra::windows::CREATE_NO_WINDOW;
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
use windows::Win32::Foundation::FILETIME;
use windows::Win32::System::Threading::GetSystemTimes;

/// Battery information (optional, only on laptops)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryInfo {
    #[serde(rename = "hasBattery")]
    pub has_battery: bool,
    pub percentage: u8,
    #[serde(rename = "cycleCount")]
    pub cycle_count: Option<u32>,
    pub status: String,
    pub health: String,
    #[serde(rename = "healthCategory")]
    pub health_category: String,
}

/// Dynamic system info that changes frequently (CPU, RAM)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DynamicInfo {
    #[serde(rename = "cpuUsage")]
    pub cpu_usage: f32,
    #[serde(rename = "memoryUsage")]
    pub memory_usage: f32,
    #[serde(rename = "memoryUsedGb")]
    pub memory_used_gb: f32,
    #[serde(rename = "memoryTotalGb")]
    pub memory_total_gb: f32,
    #[serde(rename = "processCount")]
    pub process_count: usize,
    pub battery: BatteryInfo,
    pub uptime: String,
}

/// Static system info that rarely changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaticInfo {
    pub username: String,
    pub hostname: String,
    #[serde(rename = "serialNumber")]
    pub serial_number: String,
    #[serde(rename = "osVersion")]
    pub os_version: String,
    #[serde(rename = "osBuild")]
    pub os_build: String,
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
    pub isp: String,
    #[serde(rename = "connectionType")]
    pub connection_type: String,
    #[serde(rename = "macAddress")]
    pub mac_address: String,
    pub gateway: String,
    #[serde(rename = "dnsServer")]
    pub dns_server: String,
    #[serde(rename = "antivirusStatus")]
    pub antivirus_status: String,
    #[serde(rename = "firewallStatus")]
    pub firewall_status: String,
    #[serde(rename = "bitlockerStatus")]
    pub bitlocker_status: String,
    #[serde(rename = "recentBsod")]
    pub recent_bsod: String,
    #[serde(rename = "updateStatus")]
    pub update_status: String,
    #[serde(rename = "lastScan")]
    pub last_scan: String,
}

/// Convert FILETIME to u64 for arithmetic
fn filetime_to_u64(ft: FILETIME) -> u64 {
    (ft.dwHighDateTime as u64) << 32 | ft.dwLowDateTime as u64
}

/// Measure CPU usage via GetSystemTimes (no PDH dependency).
/// Takes two snapshots with a gap and computes the delta.
fn measure_cpu_usage() -> f32 {
    let mut idle1 = FILETIME::default();
    let mut kernel1 = FILETIME::default();
    let mut user1 = FILETIME::default();

    // SAFETY: GetSystemTimes is a safe Windows API, pointers are valid stack variables
    if unsafe { GetSystemTimes(Some(&mut idle1), Some(&mut kernel1), Some(&mut user1)) }.is_err() {
        return 0.0;
    }

    std::thread::sleep(std::time::Duration::from_millis(250));

    let mut idle2 = FILETIME::default();
    let mut kernel2 = FILETIME::default();
    let mut user2 = FILETIME::default();

    if unsafe { GetSystemTimes(Some(&mut idle2), Some(&mut kernel2), Some(&mut user2)) }.is_err() {
        return 0.0;
    }

    let idle_delta = filetime_to_u64(idle2).saturating_sub(filetime_to_u64(idle1));
    let kernel_delta = filetime_to_u64(kernel2).saturating_sub(filetime_to_u64(kernel1));
    let user_delta = filetime_to_u64(user2).saturating_sub(filetime_to_u64(user1));

    // kernel time INCLUDES idle time, so total = kernel + user
    let total = kernel_delta + user_delta;
    if total == 0 {
        return 0.0;
    }

    let busy = total.saturating_sub(idle_delta);
    (busy as f64 / total as f64 * 100.0) as f32
}

/// Get the real boot time as Unix epoch seconds.
/// Uses Win32_OperatingSystem.LastBootUpTime via PowerShell (immune to Fast Startup).
/// GetTickCount64 does NOT reset on shutdown with Fast Startup enabled.
fn get_real_boot_time() -> u64 {
    // Use [DateTimeOffset]::ToUnixTimeSeconds() — returns Int64 directly,
    // no floating-point or locale-dependent parsing involved.
    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-Command",
            "([DateTimeOffset](Get-CimInstance Win32_OperatingSystem).LastBootUpTime).ToUnixTimeSeconds()",
        ])
        .output();

    if let Ok(out) = output {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if let Ok(epoch) = s.parse::<u64>() {
            return epoch;
        }
    }

    // Fallback: use GetTickCount64 (affected by Fast Startup but better than nothing)
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let ticks = unsafe { windows::Win32::System::SystemInformation::GetTickCount64() } / 1000;
    now.saturating_sub(ticks)
}

/// Persistent system monitor that keeps sysinfo instance alive
pub struct SystemMonitor {
    system: Mutex<System>,
    /// Real boot time (Unix epoch seconds), fetched once at startup
    boot_time: u64,
}

impl SystemMonitor {
    pub fn new() -> Self {
        let sys = System::new_all();
        let boot_time = get_real_boot_time();

        Self {
            system: Mutex::new(sys),
            boot_time,
        }
    }

    /// Get dynamic info (CPU, RAM, process count, battery).
    /// CPU is measured via GetSystemTimes (native Windows API, no PDH).
    /// Uptime uses real boot time from WMI (immune to Fast Startup).
    pub fn get_dynamic_info(&self) -> Result<DynamicInfo, String> {
        // Measure CPU via direct Windows API — blocks ~250ms
        let cpu_usage = measure_cpu_usage();

        // Refresh memory and processes from sysinfo
        let mut sys = self
            .system
            .lock()
            .map_err(|e| format!("System mutex poisoned: {}", e))?;

        sys.refresh_memory();
        sys.refresh_processes_specifics(ProcessesToUpdate::All, ProcessRefreshKind::everything());

        let total_memory = sys.total_memory();
        let used_memory = sys.used_memory();
        let process_count = sys.processes().len();
        let battery = get_battery_info();

        let memory_usage = if total_memory > 0 {
            (used_memory as f32 / total_memory as f32) * 100.0
        } else {
            0.0
        };

        // Calculate real uptime from stored boot time
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let uptime_secs = now.saturating_sub(self.boot_time);

        Ok(DynamicInfo {
            cpu_usage,
            memory_usage,
            memory_used_gb: used_memory as f32 / 1024.0 / 1024.0 / 1024.0,
            memory_total_gb: total_memory as f32 / 1024.0 / 1024.0 / 1024.0,
            process_count,
            battery,
            uptime: format_uptime(uptime_secs),
        })
    }
}

fn format_uptime(seconds: u64) -> String {
    let days = seconds / 86400;
    let hours = (seconds % 86400) / 3600;
    let minutes = (seconds % 3600) / 60;

    if days > 0 {
        format!("{}d {}h {}m", days, hours, minutes)
    } else if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else {
        format!("{}m", minutes)
    }
}

fn no_battery() -> BatteryInfo {
    BatteryInfo {
        has_battery: false,
        percentage: 0,
        cycle_count: None,
        status: String::new(),
        health: String::new(),
        health_category: "unknown".to_string(),
    }
}

#[derive(Debug, Clone, Default)]
struct BatteryStaticDetails {
    cycle_count: Option<u32>,
    health: String,
    health_category: String,
}

fn get_battery_static_details() -> BatteryStaticDetails {
    static BATTERY_DETAILS: OnceLock<BatteryStaticDetails> = OnceLock::new();

    BATTERY_DETAILS
        .get_or_init(query_battery_static_details)
        .clone()
}

fn query_battery_static_details() -> BatteryStaticDetails {
    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-Command",
            "$cycle = Get-CimInstance -Namespace root\\wmi -ClassName BatteryCycleCount -ErrorAction SilentlyContinue | Select-Object -First 1 CycleCount; $static = Get-CimInstance -Namespace root\\wmi -ClassName BatteryStaticData -ErrorAction SilentlyContinue | Select-Object -First 1 DesignedCapacity; $full = Get-CimInstance -Namespace root\\wmi -ClassName BatteryFullChargedCapacity -ErrorAction SilentlyContinue | Select-Object -First 1 FullChargedCapacity; [pscustomobject]@{ cycleCount = $cycle.CycleCount; designedCapacity = $static.DesignedCapacity; fullChargeCapacity = $full.FullChargedCapacity } | ConvertTo-Json -Compress"
        ])
        .output();

    let Ok(output) = output else {
        return BatteryStaticDetails {
            cycle_count: None,
            health: "Desconhecida".to_string(),
            health_category: "unknown".to_string(),
        };
    };

    if !output.status.success() {
        return BatteryStaticDetails {
            cycle_count: None,
            health: "Desconhecida".to_string(),
            health_category: "unknown".to_string(),
        };
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_value = serde_json::from_str::<serde_json::Value>(&stdout).ok();

    let cycle_count = json_value
        .as_ref()
        .and_then(|value| value.get("cycleCount"))
        .and_then(|value| value.as_u64())
        .map(|value| value as u32);

    let designed_capacity = json_value
        .as_ref()
        .and_then(|value| value.get("designedCapacity"))
        .and_then(|value| value.as_u64());

    let full_charge_capacity = json_value
        .as_ref()
        .and_then(|value| value.get("fullChargeCapacity"))
        .and_then(|value| value.as_u64());

    let (health, health_category) = match (designed_capacity, full_charge_capacity) {
        (Some(designed), Some(full)) if designed > 0 => {
            let ratio = (full as f64 / designed as f64) * 100.0;
            if ratio >= 80.0 {
                ("Boa".to_string(), "good".to_string())
            } else if ratio >= 60.0 {
                ("Media".to_string(), "medium".to_string())
            } else {
                ("Ruim".to_string(), "poor".to_string())
            }
        }
        _ => match cycle_count {
            Some(cycles) if cycles <= 300 => ("Boa".to_string(), "good".to_string()),
            Some(cycles) if cycles <= 700 => ("Media".to_string(), "medium".to_string()),
            Some(_) => ("Ruim".to_string(), "poor".to_string()),
            None => ("Desconhecida".to_string(), "unknown".to_string()),
        },
    };

    BatteryStaticDetails {
        cycle_count,
        health,
        health_category,
    }
}

fn get_battery_info() -> BatteryInfo {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

    let mut status = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut status) }.is_err() {
        return no_battery();
    }

    // BatteryFlag 0x80 (128) = no system battery present
    if status.BatteryFlag & 0x80 != 0 {
        return no_battery();
    }

    let percentage = if status.BatteryLifePercent == 255 {
        0
    } else {
        status.BatteryLifePercent
    };

    let status_str = if status.ACLineStatus == 1 {
        if status.BatteryFlag & 0x08 != 0 {
            "Carregando"
        } else {
            "Carregado"
        }
    } else {
        "Descarregando"
    };

    let static_details = get_battery_static_details();

    BatteryInfo {
        has_battery: true,
        percentage,
        cycle_count: static_details.cycle_count,
        status: status_str.to_string(),
        health: static_details.health,
        health_category: static_details.health_category,
    }
}
