use crate::commands::session::require_valid_session;
use crate::error_handling::ApiResult;
use crate::session::SessionsState;
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::ptr;
use tauri::State;
use winreg::enums::*;
use winreg::RegKey;

#[derive(Debug, Serialize, Deserialize)]
pub struct BrowserInfo {
    pub name: String,
    pub version: String,
}

/// Get file version using Windows API instead of PowerShell
fn get_file_version(path: &str) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW, VS_FIXEDFILEINFO,
    };

    let wide_path: Vec<u16> = OsStr::new(path).encode_wide().chain(Some(0)).collect();

    unsafe {
        let size = GetFileVersionInfoSizeW(PCWSTR(wide_path.as_ptr()), None);
        if size == 0 {
            return None;
        }

        let mut buffer = vec![0u8; size as usize];
        if GetFileVersionInfoW(
            PCWSTR(wide_path.as_ptr()),
            0,
            size,
            buffer.as_mut_ptr() as _,
        )
        .is_err()
        {
            return None;
        }

        let mut info_ptr: *mut std::ffi::c_void = ptr::null_mut();
        let mut len = 0u32;

        let sub_block: Vec<u16> = OsStr::new("\\").encode_wide().chain(Some(0)).collect();

        let success = VerQueryValueW(
            buffer.as_ptr() as _,
            PCWSTR(sub_block.as_ptr()),
            &mut info_ptr,
            &mut len,
        );

        if !success.as_bool() || info_ptr.is_null() || len == 0 {
            return None;
        }

        let info = &*(info_ptr as *const VS_FIXEDFILEINFO);
        Some(format!(
            "{}.{}.{}.{}",
            (info.dwFileVersionMS >> 16) & 0xFFFF,
            info.dwFileVersionMS & 0xFFFF,
            (info.dwFileVersionLS >> 16) & 0xFFFF,
            info.dwFileVersionLS & 0xFFFF
        ))
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BrowsersResponse {
    pub browsers: Vec<BrowserInfo>,
    #[serde(rename = "defaultBrowser")]
    pub default_browser: String,
}

/// Busca versão de um browser tentando o registro primeiro e depois os executáveis.
fn get_browser_version(
    registry_paths: &[(winreg::HKEY, &str)],
    exe_paths: &[String],
) -> Option<String> {
    for &(hive, path) in registry_paths {
        if let Ok(key) = RegKey::predef(hive).open_subkey(path) {
            if let Ok(version) = key.get_value::<String, _>("DisplayVersion") {
                return Some(version);
            }
            if let Ok(version) = key.get_value::<String, _>("Version") {
                return Some(version);
            }
        }
    }
    for path in exe_paths {
        if std::path::Path::new(path.as_str()).exists() {
            if let Some(version) = get_file_version(path.as_str()) {
                return Some(version);
            }
        }
    }
    None
}

fn get_chrome_version() -> Option<String> {
    let registry_paths = [
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Google Chrome",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Google Chrome",
        ),
        (
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Google Chrome",
        ),
    ];
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let exe_paths = vec![
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        &format!(r"{}\Google\Chrome\Application\chrome.exe", local_app_data),
    ]
    .into_iter()
    .map(String::from)
    .collect::<Vec<_>>();
    get_browser_version(&registry_paths, &exe_paths)
}

fn get_firefox_version() -> Option<String> {
    let registry_paths = [
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Mozilla Firefox",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Mozilla Firefox",
        ),
        (
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Mozilla Firefox",
        ),
    ];
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let exe_paths = vec![
        r"C:\Program Files\Mozilla Firefox\firefox.exe",
        r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
        &format!(r"{}\Mozilla Firefox\firefox.exe", local_app_data),
    ]
    .into_iter()
    .map(String::from)
    .collect::<Vec<_>>();
    get_browser_version(&registry_paths, &exe_paths)
}

fn get_edge_version() -> Option<String> {
    let registry_paths = [
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft Edge",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft Edge",
        ),
        (
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft Edge",
        ),
    ];
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let exe_paths = vec![
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        &format!(r"{}\Microsoft\Edge\Application\msedge.exe", local_app_data),
    ]
    .into_iter()
    .map(String::from)
    .collect::<Vec<_>>();
    get_browser_version(&registry_paths, &exe_paths)
}

fn get_opera_version() -> Option<String> {
    let registry_paths = [
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Opera",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Opera",
        ),
        (
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Opera",
        ),
    ];
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let exe_paths = vec![
        format!(r"{}\AppData\Local\Programs\Opera\opera.exe", user_profile),
        format!(
            r"{}\AppData\Local\Programs\Opera GX\opera.exe",
            user_profile
        ),
        r"C:\Program Files\Opera\opera.exe".to_string(),
        r"C:\Program Files (x86)\Opera\opera.exe".to_string(),
    ];
    get_browser_version(&registry_paths, &exe_paths)
}

fn get_brave_version() -> Option<String> {
    let registry_paths = [
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\BraveSoftware Brave-Browser",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\BraveSoftware Brave-Browser",
        ),
        (
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\BraveSoftware Brave-Browser",
        ),
    ];
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let exe_paths = vec![
        format!(
            r"{}\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe",
            user_profile
        ),
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe".to_string(),
        r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe".to_string(),
    ];
    get_browser_version(&registry_paths, &exe_paths)
}

fn get_default_browser() -> String {
    if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(
        r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice",
    ) {
        if let Ok(prog_id) = key.get_value::<String, _>("ProgId") {
            return match prog_id.as_str() {
                s if s.contains("Chrome") => "Google Chrome".to_string(),
                s if s.contains("Firefox") => "Mozilla Firefox".to_string(),
                s if s.contains("Edge") => "Microsoft Edge".to_string(),
                s if s.contains("Opera") => "Opera".to_string(),
                s if s.contains("Brave") => "Brave".to_string(),
                _ => prog_id,
            };
        }
    }
    "Desconhecido".to_string()
}

#[tauri::command]
pub async fn get_browser_info(sessions: State<'_, SessionsState>) -> ApiResult<BrowsersResponse> {
    require_valid_session(&sessions).await?;

    // Filter out non-installed browsers to return only detected ones
    let browsers = vec![
        BrowserInfo {
            name: "Google Chrome".to_string(),
            version: get_chrome_version().unwrap_or_else(|| "Não instalado".to_string()),
        },
        BrowserInfo {
            name: "Mozilla Firefox".to_string(),
            version: get_firefox_version().unwrap_or_else(|| "Não instalado".to_string()),
        },
        BrowserInfo {
            name: "Microsoft Edge".to_string(),
            version: get_edge_version().unwrap_or_else(|| "Não instalado".to_string()),
        },
        BrowserInfo {
            name: "Opera".to_string(),
            version: get_opera_version().unwrap_or_else(|| "Não instalado".to_string()),
        },
        BrowserInfo {
            name: "Brave".to_string(),
            version: get_brave_version().unwrap_or_else(|| "Não instalado".to_string()),
        },
    ];

    let installed_browsers: Vec<BrowserInfo> = browsers
        .into_iter()
        .filter(|browser| browser.version != "Não instalado")
        .collect();

    Ok(BrowsersResponse {
        browsers: installed_browsers,
        default_browser: get_default_browser(),
    })
}
