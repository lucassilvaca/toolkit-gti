pub mod admin;
pub mod auth;
mod auth_logic;
mod auth_rate_limiter;
pub mod public;
pub mod session;

pub use crate::infra::toast::show_chat_desktop_toast;
pub use admin::*;
pub use auth::*;
pub use public::*;
pub use session::{get_session, login, logout, refresh_session};

#[macro_export]
macro_rules! app_commands {
    () => {
        tauri::generate_handler![
            get_system_info,
            get_dynamic_info,
            get_static_info,
            list_disks,
            get_browser_info,
            get_processor_info,
            get_antivirus_details,
            get_services,
            get_last_update_date,
            open_task_manager,
            run_ping,
            run_ipconfig,
            run_netstat,
            check_port,
            check_web_ports,
            run_maintenance,
            run_command_streaming,
            append_log_entry,
            get_settings,
            save_settings,
            send_notification,
            send_reply,
            send_chat_invite,
            scan_online_users,
            probe_host_by_ip,
            find_user_by_name,
            get_scan_networks,
            set_scan_networks,
            is_admin,
            relaunch_as_admin,
            run_tool_with_target,
            run_network_streaming,
            stop_streaming_command,
            save_received_file,
            save_chat_history,
            load_chat_history,
            get_current_user,
            login,
            logout,
            get_session,
            refresh_session,
            set_log_path,
            get_log_path_cmd,
            select_log_directory,
            read_log_file,
            export_logs,
            read_network_config,
            write_network_config,
            is_port_available,
            get_chat_port_from_config,
            create_chat_room,
            get_chat_diagnostics,
            open_user_chat,
            show_chat_desktop_toast,
            get_runtime_alerts,
        ]
    };
}
