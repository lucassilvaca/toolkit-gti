#[macro_use]
mod logging;
mod bootstrap;
pub mod commands;
mod domain;
mod error_handling;
mod events;
pub mod infra;
// monitor and network_native moved to domain::system
pub mod session;
mod startup;

use bootstrap::{
    handle_main_window_event, initialize_session_system, setup_application, show_preferred_window,
};
use commands::{
    append_log_entry, check_port, check_web_ports, create_chat_room, export_logs,
    find_user_by_name, get_antivirus_details, get_browser_info, get_chat_diagnostics,
    get_chat_port_from_config, get_current_user, get_dynamic_info, get_last_update_date,
    get_log_path_cmd, get_processor_info, get_scan_networks, get_services, get_session,
    get_settings, get_static_info, get_system_info, is_admin, is_port_available, list_disks,
    load_chat_history, login, logout, open_task_manager, probe_host_by_ip, read_log_file,
    read_network_config, refresh_session, relaunch_as_admin, run_command_streaming, run_ipconfig,
    run_maintenance, run_netstat, run_network_streaming, run_ping, run_tool_with_target,
    save_chat_history, save_received_file, save_settings, scan_online_users, select_log_directory,
    send_chat_invite, send_notification, send_reply, set_log_path, set_scan_networks,
    show_chat_desktop_toast, stop_streaming_command, write_network_config,
};
use events::{get_runtime_alerts, open_user_chat};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::install_crash_logging();
    log_info!(
        "=== TAURI APP INITIALIZATION (v{}) ===",
        env!("CARGO_PKG_VERSION")
    );
    // Cópia elevada ("Abrir como administrador"): espera a anterior liberar
    // a instância única, a porta do chat e o named pipe.
    commands::public::elevation::wait_for_previous_instance();

    let (sessions_state, _cancel_token) = initialize_session_system();

    tauri::Builder::default()
        // Precisa ser o primeiro plugin: a segunda instância sai antes de subir
        // qualquer outra coisa (porta do chat, named pipe, bandeja).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log_info!("Segunda execução detectada; trazendo a janela existente");
            show_preferred_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_websocket::init())
        .setup(move |app| Ok(setup_application(app, sessions_state.clone())?))
        .on_window_event(handle_main_window_event)
        .invoke_handler(app_commands![])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Distingue no log um encerramento normal (Sair, logoff) de uma
            // queda: queda deixa `[FATAL]` ou nenhuma linha de encerramento.
            if let tauri::RunEvent::Exit = event {
                log_info!("=== APP ENCERRADO NORMALMENTE ===");
            }
        });
}
