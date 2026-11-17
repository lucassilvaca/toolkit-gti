//! Registro do AppUserModelID (AUMID) do Toolkit em HKCU.
//!
//! O toast nativo do Windows (WinRT `ToastNotificationManager`) só aparece de
//! forma confiável para um AUMID registrado em
//! `HKCU\Software\Classes\AppUserModelId\<AUMID>` com `DisplayName` (e,
//! opcionalmente, `IconUri`). Sem o registro, o fallback antigo dependia de
//! PowerShell — que abre uma janela de console visível.

use std::os::windows::process::CommandExt;
use std::process::Command;

use crate::infra::windows::CREATE_NO_WINDOW;
use tauri::{AppHandle, Manager};

/// Deve coincidir com `identifier` em tauri.conf.json e com o AUMID definido
/// no processo em `main.rs`.
pub const AUMID: &str = "com.gti.toolkit";

const DISPLAY_NAME: &str = "Toolkit GTI";

fn reg_add(key: &str, name: &str, value: &str) -> Result<(), String> {
    let output = Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["add", key, "/v", name, "/t", "REG_SZ", "/d", value, "/f"])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "reg add {} retornou status {} para {}",
            name, output.status, key
        ))
    }
}

/// Registra (idempotente) o AUMID do Toolkit em HKCU. Falhas só geram aviso:
/// o app continua funcionando, apenas sem toast nativo garantido.
pub fn register_aumid(app: &AppHandle) {
    let key = format!(r"HKCU\Software\Classes\AppUserModelId\{}", AUMID);

    match reg_add(&key, "DisplayName", DISPLAY_NAME) {
        Ok(()) => log_debug!("AUMID registrado: {} (DisplayName={})", AUMID, DISPLAY_NAME),
        Err(e) => {
            log_warn!("Falha ao registrar AUMID {}: {}", AUMID, e);
            return;
        }
    }

    // Ícone do toast: usa o ícone empacotado ao lado do executável, se existir.
    let icon = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("icons").join("icon.ico"))
        .filter(|path| path.exists());
    if let Some(icon) = icon {
        if let Err(e) = reg_add(&key, "IconUri", &icon.to_string_lossy()) {
            log_warn!("Falha ao registrar IconUri do AUMID {}: {}", AUMID, e);
        }
    }
}
