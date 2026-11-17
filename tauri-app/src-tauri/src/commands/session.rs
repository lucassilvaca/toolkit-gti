use crate::commands::auth_logic::validate_credentials_detailed_impl;
use crate::commands::auth_rate_limiter;
use crate::error_handling::{ApiError, ApiResult};
use crate::session::{session_utils, SessionInfo, SessionState, SessionsState};
use tauri::State;

const SESSION_KEY: &str = "main_session"; // Single session for desktop app

#[tauri::command]
pub async fn login(
    username: String,
    password: String,
    sessions: State<'_, SessionsState>,
) -> ApiResult<SessionInfo> {
    // Input validation
    if username.trim().is_empty() {
        return Err(ApiError::validation_error("username").with_details("Username cannot be empty"));
    }

    if password.is_empty() {
        return Err(ApiError::validation_error("password").with_details("Password cannot be empty"));
    }

    // Rate limiting check - prevent brute force attacks.
    // Chave normalizada: o AD não diferencia "Admin", "ADMIN" e "admin ", então
    // cada variação não pode ganhar 5 tentativas novas.
    let rate_key = username.trim().to_lowercase();
    auth_rate_limiter::check_rate_limit(&rate_key)
        .map_err(|e| ApiError::rate_limited(15).with_details(&e))?;

    // Validate credentials using existing AD validation.
    // O PowerShell do AD é bloqueante (segundos); fora do worker async.
    let user_for_check = username.clone();
    let validation_result = tokio::task::spawn_blocking(move || {
        validate_credentials_detailed_impl(user_for_check, password)
    })
    .await
    .unwrap_or_else(|e| Err(format!("Validação interrompida: {}", e)));

    match validation_result {
        Ok(auth_result) => {
            if !auth_result.success {
                // Record failed attempt for rate limiting
                auth_rate_limiter::record_failed_attempt(&rate_key);

                // Return clean user message
                return Err(ApiError::new(
                    "Credenciais inválidas. Verifique seu usuário e senha",
                    "INVALID_CREDENTIALS",
                )
                .with_details(&auth_result.message));
            }
            // Clear any previous failed attempts on success
            auth_rate_limiter::clear_attempts(&rate_key);
        }
        Err(e) => {
            // Record failed attempt for rate limiting
            auth_rate_limiter::record_failed_attempt(&rate_key);

            return Err(ApiError::new(
                "Erro na validação de credenciais. Tente novamente",
                "AUTH_VALIDATION_ERROR",
            )
            .with_details(&e));
        }
    }

    // Create new session with 30-minute timeout (default for desktop app)
    let session = SessionState::new(username.clone(), 30);
    let session_info = session.to_session_info();

    // Store session
    {
        let mut sessions_guard = sessions.write().await;
        sessions_guard.insert(SESSION_KEY.to_string(), session);
    }

    log_info!("[SESSION] User logged in: {}", session_info.user);
    Ok(session_info)
}

#[tauri::command]
pub async fn logout(sessions: State<'_, SessionsState>) -> ApiResult<()> {
    let mut sessions_guard = sessions.write().await;

    if let Some(session) = sessions_guard.remove(SESSION_KEY) {
        log_info!("[SESSION] User logged out: {}", session.user);
    }

    Ok(())
}

#[tauri::command]
pub async fn get_session(sessions: State<'_, SessionsState>) -> ApiResult<Option<SessionInfo>> {
    if let Some(info) = session_utils::get_session_info(&sessions, SESSION_KEY)
        .await
        .map_err(|e| ApiError::internal_error().with_details(&e))?
    {
        return Ok(Some(info));
    }

    let _ = session_utils::remove_session(&sessions, SESSION_KEY).await;
    Ok(None)
}

#[tauri::command]
pub async fn refresh_session(sessions: State<'_, SessionsState>) -> ApiResult<()> {
    // Use the new touch_session utility for automatic cleanup and refresh
    let session_refreshed = session_utils::touch_session(&sessions, SESSION_KEY)
        .await
        .map_err(|e| ApiError::internal_error().with_details(&e))?;

    if session_refreshed {
        Ok(())
    } else {
        Err(ApiError::auth_required())
    }
}

pub async fn require_valid_session(sessions: &SessionsState) -> ApiResult<String> {
    // Use the new touch_session utility for automatic cleanup and refresh
    let session_valid = session_utils::touch_session(sessions, SESSION_KEY)
        .await
        .map_err(|e| ApiError::internal_error().with_details(&e))?;

    if !session_valid {
        return Err(ApiError::auth_required());
    }

    // Get user info from the valid session
    let sessions_guard = sessions.read().await;
    if let Some(session) = sessions_guard.get(SESSION_KEY) {
        Ok(session.user.clone())
    } else {
        Err(ApiError::auth_required())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::state::create_sessions_state_validated;

    #[tokio::test]
    async fn test_require_valid_session_no_session() {
        let sessions = create_sessions_state_validated().unwrap();

        let result = require_valid_session(&sessions).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, "AUTH_REQUIRED");
    }

    #[tokio::test]
    async fn test_session_refresh_and_require() {
        let sessions = create_sessions_state_validated().unwrap();

        // Manually add a session
        {
            let mut sessions_guard = sessions.write().await;
            let session = SessionState::new("test_user".to_string(), 30);
            sessions_guard.insert(SESSION_KEY.to_string(), session);
        }

        // Test require_valid_session
        let result = require_valid_session(&sessions).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "test_user");
    }

    #[tokio::test]
    async fn test_get_session_empty() {
        let sessions = create_sessions_state_validated().unwrap();

        // Test get_session on empty state
        {
            let sessions_guard = sessions.read().await;
            assert!(!sessions_guard.contains_key(SESSION_KEY));
        }

        // Since we can't easily mock State in tests, we test the logic directly
        let sessions_guard = sessions.read().await;
        let session_result = sessions_guard.get(SESSION_KEY);
        assert!(session_result.is_none());
    }

    #[tokio::test]
    async fn test_logout_removes_session() {
        let sessions = create_sessions_state_validated().unwrap();

        // Add session
        {
            let mut sessions_guard = sessions.write().await;
            let session = SessionState::new("test_user".to_string(), 30);
            sessions_guard.insert(SESSION_KEY.to_string(), session);
        }

        // Verify session exists before logout
        {
            let sessions_guard = sessions.read().await;
            assert!(sessions_guard.contains_key(SESSION_KEY));
        }

        // Simulate logout by removing session (same logic as in logout command)
        {
            let mut sessions_guard = sessions.write().await;
            let removed = sessions_guard.remove(SESSION_KEY);
            assert!(removed.is_some());
        }

        // Verify session removed
        {
            let sessions_guard = sessions.read().await;
            assert!(!sessions_guard.contains_key(SESSION_KEY));
        }
    }

    #[tokio::test]
    async fn test_session_management_flow() {
        let sessions = create_sessions_state_validated().unwrap();

        // Add session manually (simulating login)
        {
            let mut sessions_guard = sessions.write().await;
            let session = SessionState::new("test_user".to_string(), 30);
            sessions_guard.insert(SESSION_KEY.to_string(), session);
        }

        // Test session exists
        {
            let sessions_guard = sessions.read().await;
            let session = sessions_guard.get(SESSION_KEY).unwrap();
            assert_eq!(session.user, "test_user");
            assert!(!session.is_expired());
        }

        // Test logout removes session
        {
            let mut sessions_guard = sessions.write().await;
            let removed = sessions_guard.remove(SESSION_KEY);
            assert!(removed.is_some());
        }

        // Verify session removed
        {
            let sessions_guard = sessions.read().await;
            assert!(!sessions_guard.contains_key(SESSION_KEY));
        }
    }

    #[tokio::test]
    async fn test_rate_limiting_integration() {
        // Test that rate limiter is properly integrated
        // Clear any previous attempts for test user
        auth_rate_limiter::clear_attempts("test_rate_limit");

        // Should allow initial attempts
        let result = auth_rate_limiter::check_rate_limit("test_rate_limit");
        assert!(result.is_ok());

        // Record several failed attempts
        for _ in 0..5 {
            auth_rate_limiter::record_failed_attempt("test_rate_limit");
        }

        // Should now be blocked
        let result = auth_rate_limiter::check_rate_limit("test_rate_limit");
        assert!(result.is_err());

        // Clear attempts should restore access
        auth_rate_limiter::clear_attempts("test_rate_limit");
        let result = auth_rate_limiter::check_rate_limit("test_rate_limit");
        assert!(result.is_ok());
    }
}
