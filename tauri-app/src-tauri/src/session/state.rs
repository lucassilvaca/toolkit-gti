use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Session state maintained for an authenticated user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionState {
    /// Authenticated user identifier
    pub user: String,
    /// Timestamp when authentication was completed
    pub authenticated_at: DateTime<Utc>,
    /// Timestamp of last user activity
    pub last_activity: DateTime<Utc>,
    /// Session timeout in minutes
    pub timeout_minutes: u64,
}

/// Session information exposed to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    /// Authenticated user identifier
    pub user: String,
    /// Timestamp when authentication was completed
    pub authenticated_at: DateTime<Utc>,
    /// Minutes until session expires
    pub expires_in_minutes: i64,
}

impl SessionState {
    /// Create a new session state
    pub fn new(user: String, timeout_minutes: u64) -> Self {
        let now = Utc::now();
        Self {
            user,
            authenticated_at: now,
            last_activity: now,
            timeout_minutes,
        }
    }

    /// Check if the session has expired
    pub fn is_expired(&self) -> bool {
        let elapsed = Utc::now()
            .signed_duration_since(self.last_activity)
            .num_minutes();
        elapsed >= self.timeout_minutes as i64
    }

    /// Update the last activity timestamp
    pub fn refresh_activity(&mut self) {
        self.last_activity = Utc::now();
    }

    /// Convert to session info for frontend
    pub fn to_session_info(&self) -> SessionInfo {
        let elapsed = Utc::now()
            .signed_duration_since(self.last_activity)
            .num_minutes();
        let expires_in = (self.timeout_minutes as i64) - elapsed;

        SessionInfo {
            user: self.user.clone(),
            authenticated_at: self.authenticated_at,
            expires_in_minutes: expires_in.max(0),
        }
    }
}

/// Thread-safe sessions storage
pub type SessionsState = Arc<RwLock<HashMap<String, SessionState>>>;

/// Create a new sessions state container.
pub fn create_sessions_state() -> SessionsState {
    Arc::new(RwLock::new(HashMap::new()))
}

/// Session management utilities
impl SessionState {
    /// Check if session is close to expiring (within 5 minutes)
    pub fn is_close_to_expiring(&self) -> bool {
        let elapsed = Utc::now()
            .signed_duration_since(self.last_activity)
            .num_minutes();
        let remaining = (self.timeout_minutes as i64) - elapsed;
        remaining <= 5 && remaining > 0
    }
}

/// Create a new sessions state container with validation
pub fn create_sessions_state_validated() -> Result<SessionsState, String> {
    let sessions_state = create_sessions_state();

    // Validate session state was created successfully
    // Test that we can acquire read lock
    let test_result = sessions_state.try_read();
    match test_result {
        Ok(_) => {
            // Drop the lock guard immediately
            drop(test_result);
            Ok(sessions_state)
        }
        Err(_) => Err("Session state lock is corrupted".to_string()),
    }
}

/// Utility functions for session management
pub mod session_utils {
    use super::*;

    /// Clean up expired sessions from the state
    /// Returns the number of sessions removed
    pub async fn cleanup_expired_sessions(sessions_state: &SessionsState) -> Result<usize, String> {
        let mut sessions = sessions_state.write().await;

        // Collect keys of expired sessions
        let expired_keys: Vec<String> = sessions
            .iter()
            .filter_map(|(key, session)| {
                if session.is_expired() {
                    Some(key.clone())
                } else {
                    None
                }
            })
            .collect();

        // Remove expired sessions
        for key in &expired_keys {
            sessions.remove(key);
        }

        let removed_count = expired_keys.len();
        if removed_count > 0 {
            eprintln!("Cleanup: removidas {} sessões expiradas", removed_count);
        }

        Ok(removed_count)
    }

    /// Get all active (non-expired) sessions
    pub async fn get_active_sessions(
        sessions_state: &SessionsState,
    ) -> Result<Vec<(String, SessionState)>, String> {
        let sessions = sessions_state.read().await;

        let active_sessions: Vec<(String, SessionState)> = sessions
            .iter()
            .filter_map(|(key, session)| {
                if !session.is_expired() {
                    Some((key.clone(), session.clone()))
                } else {
                    None
                }
            })
            .collect();

        Ok(active_sessions)
    }

    /// Force cleanup of a specific session
    pub async fn remove_session(
        sessions_state: &SessionsState,
        session_key: &str,
    ) -> Result<bool, String> {
        let mut sessions = sessions_state.write().await;
        Ok(sessions.remove(session_key).is_some())
    }

    /// Read session info without mutating activity timestamps.
    pub async fn get_session_info(
        sessions_state: &SessionsState,
        session_key: &str,
    ) -> Result<Option<SessionInfo>, String> {
        let sessions = sessions_state.read().await;

        if let Some(session) = sessions.get(session_key) {
            if session.is_expired() {
                return Ok(None);
            }

            return Ok(Some(session.to_session_info()));
        }

        Ok(None)
    }

    /// Update activity for a session and auto-cleanup if expired
    pub async fn touch_session(
        sessions_state: &SessionsState,
        session_key: &str,
    ) -> Result<bool, String> {
        let mut sessions = sessions_state.write().await;

        if let Some(session) = sessions.get_mut(session_key) {
            if session.is_expired() {
                // Session is expired, remove it
                sessions.remove(session_key);
                Ok(false) // Session was expired and removed
            } else {
                // Session is valid, update activity
                session.refresh_activity();
                Ok(true) // Session updated successfully
            }
        } else {
            Ok(false) // Session not found
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;
    use tokio::time::{sleep, Duration as TokioDuration};

    #[test]
    fn test_session_state_creation() {
        let session = SessionState::new("test_user".to_string(), 20);

        assert_eq!(session.user, "test_user");
        assert_eq!(session.timeout_minutes, 20);
        assert!(!session.is_expired());

        // Should be recent
        let now = Utc::now();
        let diff = now
            .signed_duration_since(session.authenticated_at)
            .num_seconds();
        assert!(diff < 2); // Within 2 seconds
    }

    #[test]
    fn test_session_info_conversion() {
        let session = SessionState::new("test_user".to_string(), 20);
        let info = session.to_session_info();

        assert_eq!(info.user, "test_user");
        assert_eq!(info.authenticated_at, session.authenticated_at);
        assert!(info.expires_in_minutes >= 19); // Should be close to 20
        assert!(info.expires_in_minutes <= 20);
    }

    #[tokio::test]
    async fn test_activity_refresh() {
        let mut session = SessionState::new("test_user".to_string(), 20);
        let original_activity = session.last_activity;

        // Wait a bit and refresh
        sleep(TokioDuration::from_millis(10)).await;
        session.refresh_activity();

        assert!(session.last_activity > original_activity);
    }

    #[test]
    fn test_session_expiration_logic() {
        let mut session = SessionState::new("test_user".to_string(), 20);

        // Fresh session should not be expired
        assert!(!session.is_expired());

        // Simulate old activity
        session.last_activity = Utc::now() - Duration::minutes(25);
        assert!(session.is_expired());

        // Refresh activity should make it not expired
        session.refresh_activity();
        assert!(!session.is_expired());
    }
}
