//! Session Runtime Module
//!
//! This module is responsible for initializing the session management system
//! including session state validation and background cleanup tasks.
//!
//! # Responsibilities
//!
//! - Initialize and validate session state using `create_sessions_state_validated`
//! - Set up background cleanup tasks with proper lifecycle management
//! - Provide cancellation token for graceful shutdown (future implementation)
//! - Fail-fast behavior if session system cannot be initialized
//!
//! # Architecture
//!
//! The session runtime follows a fail-fast approach where critical initialization
//! failures result in immediate application termination to prevent undefined behavior.
//! Background cleanup tasks are spawned with cancellation tokens for future
//! graceful shutdown implementations.

use crate::session::{create_sessions_state_validated, start_session_cleanup_task, SessionsState};
use tokio_util::sync::CancellationToken;

// Note: log_error! macro is available globally via #[macro_use] in lib.rs

/// Inicializa o sistema de sessões com background cleanup
///
/// Esta função extrai a lógica de inicialização do session system do lib.rs,
/// fornecendo uma interface limpa para setup do sistema de sessões.
///
/// # Comportamento
///
/// - Cria e valida o estado das sessões
/// - Configura task de cleanup em background com lifecycle adequado
/// - Retorna token de cancelamento para controle futuro
/// - Executa fail-fast se a inicialização falhar (process::exit)
///
/// # Returns
///
/// Tupla contendo:
/// - `SessionsState`: Estado validado das sessões para gerenciamento
/// - `CancellationToken`: Token para controle de lifecycle das tasks
///
/// # Panics
///
/// Esta função executará `std::process::exit(1)` se não conseguir
/// inicializar o sistema de sessões, seguindo o princípio fail-fast.
pub fn initialize_session_system() -> (SessionsState, CancellationToken) {
    // Initialize session management with validation
    let sessions_state = match create_sessions_state_validated() {
        Ok(state) => state,
        Err(e) => {
            log_error!("[CRITICAL] Failed to initialize session system: {}", e);
            std::process::exit(1); // Fail fast if session system can't initialize
        }
    };

    let sessions_for_cleanup = sessions_state.clone();

    // Start background cleanup task with proper lifecycle
    let cancel_token = CancellationToken::new();
    let cleanup_token = cancel_token.clone();

    tauri::async_runtime::spawn(async move {
        start_session_cleanup_task(sessions_for_cleanup, cleanup_token).await;
    });

    // Store cancel token for potential future graceful shutdown
    // (For now, just let it run - future versions will add proper shutdown)

    (sessions_state, cancel_token)
}
