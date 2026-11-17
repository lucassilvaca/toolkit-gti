//! Composition root helpers extracted from `lib.rs`.

pub mod app_bootstrap;
pub mod chat_runtime;
pub mod session_runtime;
pub mod tray_setup;
pub mod wiring;

pub use app_bootstrap::initialize_core_app;
pub use chat_runtime::initialize_chat_system;
pub use session_runtime::initialize_session_system;
pub use tray_setup::{setup_system_tray, show_preferred_window};
pub use wiring::{handle_main_window_event, setup_application};
