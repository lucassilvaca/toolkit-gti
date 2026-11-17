// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
fn set_process_app_user_model_id() {
    use windows::core::w;
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
    // Deve coincidir com `identifier` em tauri.conf.json (toast / agrupamento na barra de tarefas).
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(w!("com.gti.toolkit"));
    }
}

fn main() {
    #[cfg(windows)]
    set_process_app_user_model_id();
    toolkit_gti_lib::run()
}
