//! WebSocket chat system for Toolkit GTI.
//!
//! Split into submodules by responsibility:
//! - `room_manager` — room lifecycle, cleanup, invariants
//! - `ws_server`    — axum WebSocket transport layer
//! - `storage`      — chat history persistence (unchanged from TCP era)

mod room_manager;
mod storage;
mod ws_server;

use serde::{Deserialize, Serialize};

// Re-export public API
pub use room_manager::{RoomDiagnostics, RoomManager};
pub use storage::{load_chat_history, save_chat_history, save_received_file};
pub use ws_server::{boot_ws_server, create_chat_room, get_chat_diagnostics, WsServerState};

// ─── ChatMessage (used by storage and frontend serialization) ────────────────

fn default_kind() -> String {
    "text".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub from: String,
    pub text: String,
    pub timestamp: String,
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}
