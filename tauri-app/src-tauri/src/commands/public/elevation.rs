//! Elevação sob demanda. O app roda `asInvoker` (ver `build.rs`): no PC do
//! usuário sobe sem privilégio, só com bandeja e chat. O técnico clica em
//! "Abrir como administrador" e o app se reabre pelo UAC; a cópia elevada
//! espera esta sair antes de subir (porta do chat, named pipe e instância
//! única só aceitam um dono).

use crate::error_handling::{ApiError, ApiResult};
use tauri::AppHandle;

/// Argumento da cópia elevada: PID da instância que vai encerrar.
const WAIT_PID_ARG: &str = "--wait-pid";
/// Tempo máximo que a cópia elevada espera a anterior sair.
#[cfg(windows)]
const WAIT_PREVIOUS_MS: u32 = 15_000;

/// PID informado em `--wait-pid <pid>`, se houver.
fn pid_to_wait(args: impl IntoIterator<Item = String>) -> Option<u32> {
    let mut args = args.into_iter();
    args.position(|arg| arg == WAIT_PID_ARG)?;
    args.next()?.parse().ok()
}

/// Chamado no início de `run()`: se esta é a cópia elevada, espera a
/// instância sem privilégio terminar de sair.
#[cfg(windows)]
pub fn wait_for_previous_instance() {
    use windows::Win32::Foundation::{CloseHandle, WAIT_TIMEOUT};
    use windows::Win32::System::Threading::{
        OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE,
    };

    let Some(pid) = pid_to_wait(std::env::args()) else {
        return;
    };
    // SAFETY: handle aberto aqui, usado só nesta função e sempre fechado.
    unsafe {
        // Falha ao abrir = processo já saiu.
        let Ok(handle) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) else {
            return;
        };
        if WaitForSingleObject(handle, WAIT_PREVIOUS_MS) == WAIT_TIMEOUT {
            log_warn!(
                "Instância anterior (PID {}) não saiu em {} ms",
                pid,
                WAIT_PREVIOUS_MS
            );
        }
        let _ = CloseHandle(handle);
    }
}

#[cfg(not(windows))]
pub fn wait_for_previous_instance() {}

/// Reabre o app elevado (UAC) e encerra esta instância. Sem credencial de
/// administrador o UAC é cancelado e esta instância continua como estava.
#[cfg(windows)]
#[tauri::command]
pub fn relaunch_as_admin(app: AppHandle) -> ApiResult<()> {
    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::Foundation::ERROR_CANCELLED;
    use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW};
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    if super::system_info::is_admin() {
        return Ok(());
    }

    let exe = std::env::current_exe()
        .map_err(|e| ApiError::internal_error().with_details(&e.to_string()))?;
    let file = HSTRING::from(exe.as_path());
    let params = HSTRING::from(format!("{} {}", WAIT_PID_ARG, std::process::id()));
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOASYNC,
        lpVerb: w!("runas"),
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: PCWSTR(params.as_ptr()),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };

    // SAFETY: `info` e as strings que ele aponta vivem até o fim da chamada.
    if let Err(e) = unsafe { ShellExecuteExW(&mut info) } {
        if e.code() == ERROR_CANCELLED.to_hresult() {
            return Err(ApiError::permission_denied()
                .with_details("Elevação cancelada ou sem credencial de administrador"));
        }
        log_error!("Falha ao reabrir como administrador: {}", e);
        return Err(ApiError::internal_error().with_details(&e.to_string()));
    }

    log_info!("Cópia elevada iniciada; encerrando a instância sem privilégio");
    app.exit(0);
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn relaunch_as_admin(_app: AppHandle) -> ApiResult<()> {
    Err(ApiError::permission_denied())
}

#[cfg(test)]
mod tests {
    use super::pid_to_wait;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn le_o_pid_depois_do_argumento() {
        assert_eq!(
            pid_to_wait(args(&["app.exe", "--wait-pid", "4321"])),
            Some(4321)
        );
    }

    #[test]
    fn sem_argumento_ou_pid_invalido_nao_espera() {
        assert_eq!(pid_to_wait(args(&["app.exe"])), None);
        assert_eq!(pid_to_wait(args(&["app.exe", "--wait-pid"])), None);
        assert_eq!(pid_to_wait(args(&["app.exe", "--wait-pid", "abc"])), None);
    }
}
