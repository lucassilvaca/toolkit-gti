use crate::commands::session::require_valid_session;
use crate::error_handling::ApiResult;
use crate::session::SessionsState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(rename = "pingTarget", default = "default_ping_target")]
    pub ping_target: String,
    #[serde(rename = "portTarget", default = "default_port_target")]
    pub port_target: String,
    #[serde(rename = "pingInfinite", default)]
    pub ping_infinite: bool,
}

fn default_ping_target() -> String {
    "8.8.8.8".to_string()
}

fn default_port_target() -> String {
    "google.com".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ping_target: default_ping_target(),
            port_target: default_port_target(),
            ping_infinite: false,
        }
    }
}

fn settings_path() -> PathBuf {
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    PathBuf::from(home).join(".toolkit_gti").join("config.json")
}

#[tauri::command]
pub async fn get_settings(sessions: State<'_, SessionsState>) -> ApiResult<AppSettings> {
    require_valid_session(&sessions).await?;
    let path = settings_path();
    if let Ok(content) = std::fs::read_to_string(&path) {
        Ok(serde_json::from_str(&content).unwrap_or_default())
    } else {
        Ok(AppSettings::default())
    }
}

#[tauri::command]
pub async fn save_settings(
    settings: AppSettings,
    sessions: State<'_, SessionsState>,
) -> ApiResult<()> {
    require_valid_session(&sessions).await?;
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(&settings)?;
    std::fs::write(&path, content)?;
    Ok(())
}
