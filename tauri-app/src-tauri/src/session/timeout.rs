use super::state::{session_utils, SessionsState};
use std::sync::Arc;
use tokio::time::{sleep, Duration};
use tokio_util::sync::CancellationToken;

pub async fn start_session_cleanup_task(sessions: SessionsState, cancel_token: CancellationToken) {
    let sessions_clone = Arc::clone(&sessions);

    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                _ = sleep(Duration::from_secs(60)) => {
                    // Usar a nova função de cleanup com melhor error handling
                    match session_utils::cleanup_expired_sessions(&sessions_clone).await {
                        Ok(removed_count) => {
                            if removed_count > 0 {
                                log_info!("[SESSION] Cleanup: {} sessões expiradas removidas", removed_count);
                            }
                        }
                        Err(e) => {
                            log_error!("[SESSION] Cleanup error: {}", e);
                        }
                    }
                }
                _ = cancel_token.cancelled() => {
                    log_info!("[SESSION] Cleanup task shutting down");
                    break;
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::state::{create_sessions_state_validated, SessionState};

    #[tokio::test]
    async fn test_session_cleanup_integration() {
        let sessions = create_sessions_state_validated().unwrap();

        // Add a session that will expire immediately
        {
            let mut sessions_guard = sessions.write().await;
            let session = SessionState::new("test_user".to_string(), 0); // Immediate expiry
            sessions_guard.insert("test_key".to_string(), session);
        }

        // Verify session exists
        {
            let sessions_guard = sessions.read().await;
            assert!(sessions_guard.contains_key("test_key"));
        }

        // Wait a moment for expiration
        sleep(Duration::from_millis(10)).await;

        // Run cleanup using the new utility function
        let removed_count = session_utils::cleanup_expired_sessions(&sessions)
            .await
            .unwrap();
        assert_eq!(removed_count, 1);

        // Verify session was removed
        {
            let sessions_guard = sessions.read().await;
            assert!(!sessions_guard.contains_key("test_key"));
        }
    }

    #[tokio::test]
    async fn test_cleanup_preserves_active_sessions() {
        let sessions = create_sessions_state_validated().unwrap();

        // Add an active session
        {
            let mut sessions_guard = sessions.write().await;
            let session = SessionState::new("active_user".to_string(), 20); // 20 minutes timeout
            sessions_guard.insert("active_key".to_string(), session);
        }

        // Run cleanup
        let removed_count = session_utils::cleanup_expired_sessions(&sessions)
            .await
            .unwrap();
        assert_eq!(removed_count, 0); // No sessions should be removed

        // Verify active session remains
        {
            let sessions_guard = sessions.read().await;
            assert!(sessions_guard.contains_key("active_key"));
        }
    }
}
