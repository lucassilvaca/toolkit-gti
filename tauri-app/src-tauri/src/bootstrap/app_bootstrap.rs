//! Core app bootstrap extracted from `lib.rs`.

use crate::{
    commands::{self, WsServerState},
    domain::system::SystemMonitor,
    session::SessionsState,
    startup::configure_windows_startup,
};
use std::sync::{Arc, Mutex};
use tauri::{App, Manager};

pub fn initialize_core_app(app: &mut App, sessions_state: SessionsState) -> Arc<WsServerState> {
    log_debug!("Step 1: Creating SystemMonitor...");
    let monitor = Arc::new(SystemMonitor::new());
    app.manage(monitor);
    log_debug!("Step 1 COMPLETE: SystemMonitor managed");

    log_debug!("Step 2: Creating StreamingProcessState...");
    app.manage(commands::admin::network::StreamingProcessState(Arc::new(
        std::sync::Mutex::new(None),
    )));
    log_debug!("Step 2 COMPLETE: StreamingProcessState managed");

    log_debug!("Step 3: Creating WsServerState...");
    let ws_state = Arc::new(WsServerState::new());
    app.manage(ws_state.clone());
    // Antes do runtime do chat: firewall/pipe/WS registram alertas nele.
    app.manage(crate::events::RuntimeAlerts::default());
    log_debug!("Step 3 COMPLETE: WsServerState managed");

    log_debug!("Step 4: Creating SessionsState...");
    app.manage(sessions_state);
    log_debug!("Step 4 COMPLETE: SessionsState managed");

    log_debug!("Step 5: Creating LogPathState...");
    app.manage(commands::admin::log::LogPathState(Mutex::new(None)));
    log_debug!("Step 5 COMPLETE: LogPathState managed");

    log_debug!("Step 5b: Configuring Windows startup/background behavior...");
    configure_windows_startup(&app.handle().clone());
    log_debug!("Step 5b COMPLETE: Startup/background behavior configured");

    ws_state
}
