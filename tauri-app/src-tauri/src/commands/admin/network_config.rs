//! Network configuration commands for TCP port management
//!
//! Provides commands to read/write network configuration (TCP port for chat)
//! and validate if a port is available for binding.

use crate::commands::session::require_valid_session;
use crate::error_handling::{ApiError, ApiResult};
use crate::session::SessionsState;
use serde::{Deserialize, Serialize};
use std::net::TcpListener;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

pub const DEFAULT_CHAT_PORT: u16 = 7890;

/// Ports that are commonly used by system services and should not be used for chat
const BLOCKED_PORTS: &[u16] = &[
    // Web services
    21, 22, 23, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, // Windows services
    135, 139, 445, 3389, // Database services
    1433, 1521, 3306, 5432, 6379, 27017, // Development services (commonly used)
    3000, 3001, 4200, 5000, 5173, 8000, 8080, 8443, 9000, // IRC ports
    6660, 6661, 6662, 6663, 6664, 6665, 6666, 6667, 6668, 6669, // Other well-known ports
    161, 162, 389, 636, 1883, 5432, 5672, 8883,
];

/// Network configuration stored in config/network.json
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkConfig {
    pub tcp_port: u16,
    pub last_modified: String,
    pub applied_at: String,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            tcp_port: DEFAULT_CHAT_PORT,
            last_modified: now.clone(),
            applied_at: now,
        }
    }
}

pub fn resolve_runtime_config(app: &AppHandle) -> NetworkConfig {
    read_network_config_sync(app).unwrap_or_else(|e| {
        log_warn!(
            "Failed to resolve runtime config from disk, falling back to default: {}",
            e
        );
        NetworkConfig::default()
    })
}

pub fn load_chat_port(app: &AppHandle) -> u16 {
    resolve_runtime_config(app).tcp_port
}

/// Get the path to the network configuration file
fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config directory: {}", e))?;

    Ok(config_dir.join("network.json"))
}

fn read_network_config_sync(app: &AppHandle) -> Result<NetworkConfig, String> {
    let config_path = get_config_path(app)?;

    if !config_path.exists() {
        return Ok(NetworkConfig::default());
    }

    let contents = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    serde_json::from_str(&contents).map_err(|e| format!("Failed to parse config file: {}", e))
}

/// Read network configuration from file
/// Returns default config if file doesn't exist
#[tauri::command]
pub async fn read_network_config(
    app: AppHandle,
    sessions: State<'_, SessionsState>,
) -> ApiResult<String> {
    require_valid_session(&sessions).await?;
    let config = read_network_config_sync(&app)
        .map_err(|e| ApiError::config_error("network").with_details(&e))?;
    serde_json::to_string(&config).map_err(ApiError::from)
}

/// Write network configuration to file
#[tauri::command]
pub async fn write_network_config(
    app: AppHandle,
    config: String,
    sessions: State<'_, SessionsState>,
) -> ApiResult<()> {
    require_valid_session(&sessions).await?;
    let config_path =
        get_config_path(&app).map_err(|e| ApiError::config_error("network").with_details(&e))?;
    let config_dir = config_path.parent().ok_or_else(|| {
        ApiError::config_error("network").with_details("Failed to get parent directory")
    })?;

    // Ensure config directory exists
    tokio::fs::create_dir_all(config_dir).await?;

    // Validate the config before writing
    let parsed_config: NetworkConfig = serde_json::from_str(&config)?;

    // Enhanced port validation
    if parsed_config.tcp_port < 1024 {
        return Err(ApiError::validation_error("tcp_port").with_details("Port deve estar entre 1024 e 65535 (portas abaixo de 1024 requerem privilégios administrativos)"));
    }

    if is_port_blocked(parsed_config.tcp_port) {
        let service_name = get_port_block_reason(parsed_config.tcp_port)
            .map(|s| format!(" (usado por {})", s))
            .unwrap_or_default();

        return Err(ApiError::config_error("tcp_port").with_details(&format!(
            "Porta {} está reservada para serviços do sistema{}. Recomendamos portas entre 8000-65000",
            parsed_config.tcp_port,
            service_name
        )));
    }

    // Check if port is actually available
    if !is_port_available_internal(parsed_config.tcp_port) {
        return Err(ApiError::config_error("tcp_port").with_details(&format!(
            "Porta {} não está disponível (pode estar em uso por outro serviço)",
            parsed_config.tcp_port
        )));
    }

    // Write to file
    tokio::fs::write(&config_path, config).await?;

    Ok(())
}

/// Check if a port is in the blocked list
fn is_port_blocked(port: u16) -> bool {
    BLOCKED_PORTS.contains(&port)
}

/// Get a human-readable reason why a port might be blocked
fn get_port_block_reason(port: u16) -> Option<&'static str> {
    match port {
        21 => Some("FTP"),
        22 => Some("SSH"),
        23 => Some("Telnet"),
        25 => Some("SMTP"),
        53 => Some("DNS"),
        80 => Some("HTTP"),
        110 => Some("POP3"),
        143 => Some("IMAP"),
        443 => Some("HTTPS"),
        445 => Some("SMB"),
        1433 => Some("SQL Server"),
        3306 => Some("MySQL"),
        3389 => Some("Remote Desktop"),
        5432 => Some("PostgreSQL"),
        8080 => Some("HTTP Proxy/Tomcat"),
        _ => None,
    }
}

/// Check if a port is available for binding
/// Returns true if the port is available, false if it's in use
fn is_port_available_internal(port: u16) -> bool {
    // Validate port range first (inclusivo em 65535 — a UI permite ate 65535;
    // `1024..65535` exclui o fim e rejeitava a porta maxima por engano).
    if !(1024..=65535).contains(&port) {
        return false;
    }

    // Check if port is blocked for security reasons
    if is_port_blocked(port) {
        return false;
    }

    // Try to bind to the port on 127.0.0.1
    match TcpListener::bind(format!("127.0.0.1:{}", port)) {
        Ok(_) => true, // Port is available
        Err(e) => {
            log_debug!("Port {} is not available: {}", port, e);
            false // Port is in use
        }
    }
}

#[tauri::command]
pub async fn is_port_available(port: u16, sessions: State<'_, SessionsState>) -> ApiResult<bool> {
    require_valid_session(&sessions).await?;
    Ok(is_port_available_internal(port))
}

/// Get the current TCP port for chat
/// Returns the port from config or default 7890
#[tauri::command]
pub async fn get_chat_port_from_config(
    app: AppHandle,
    sessions: State<'_, SessionsState>,
) -> ApiResult<u16> {
    require_valid_session(&sessions).await?;
    Ok(load_chat_port(&app))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_config_default() {
        let config = NetworkConfig::default();
        assert_eq!(config.tcp_port, 7890);
        assert!(!config.last_modified.is_empty());
        assert!(!config.applied_at.is_empty());

        // Verify our default port is not blocked
        assert!(!is_port_blocked(DEFAULT_CHAT_PORT));
    }

    #[test]
    fn test_port_validation() {
        // Blocked ports should return false
        assert!(!is_port_available_internal(80));
        assert!(!is_port_available_internal(443));
        assert!(!is_port_available_internal(3306));
        assert!(!is_port_available_internal(8080));

        // Invalid ports should return false
        assert!(!is_port_available_internal(0));
        assert!(!is_port_available_internal(1023));

        // Limite superior (65535) deve estar DENTRO da faixa valida: a checagem
        // de faixa nao pode descartar a porta maxima (regressao do off-by-one).
        // Pode falhar so se 65535 estiver realmente em uso na maquina de teste.
        assert!(is_port_available_internal(65535));

        // Test blocked port detection
        assert!(is_port_blocked(80));
        assert!(is_port_blocked(443));
        assert!(is_port_blocked(3306));
        assert!(!is_port_blocked(7890)); // Our default port should not be blocked

        // Test port reason lookup
        assert_eq!(get_port_block_reason(80), Some("HTTP"));
        assert_eq!(get_port_block_reason(443), Some("HTTPS"));
        assert_eq!(get_port_block_reason(3306), Some("MySQL"));
        assert_eq!(get_port_block_reason(7890), None);

        // Safe high ports should generally be available
        // Note: This might fail if something is using that port
        assert!(is_port_available_internal(65000));
    }

    #[test]
    fn test_config_serialization() {
        let config = NetworkConfig {
            tcp_port: 8080,
            last_modified: "2024-01-01T00:00:00Z".to_string(),
            applied_at: "2024-01-01T00:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&config).unwrap();
        let parsed: NetworkConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.tcp_port, 8080);
        assert_eq!(parsed.last_modified, "2024-01-01T00:00:00Z");
    }
}
