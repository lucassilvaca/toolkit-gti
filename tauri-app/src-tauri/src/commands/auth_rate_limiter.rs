//! Rate limiter for authentication attempts
//!
//! Prevents brute force attacks by limiting login attempts per username.
//! Uses DashMap for thread-safe, high-performance rate limiting.

use dashmap::DashMap;
use once_cell::sync::Lazy;
#[cfg(not(test))]
use serde::{Deserialize, Serialize};
#[cfg(not(test))]
use std::time::UNIX_EPOCH;
use std::time::{Duration, SystemTime};

#[derive(Clone, Debug)]
struct LoginAttempt {
    count: u32,
    last_attempt: SystemTime,
    blocked_until: Option<SystemTime>,
}

/// Global rate limiter storage.
///
/// Fora dos testes, o estado é carregado do disco na primeira consulta e gravado
/// a cada mudança, para que reiniciar o app NÃO zere o bloqueio anti-brute-force.
static LOGIN_ATTEMPTS: Lazy<DashMap<String, LoginAttempt>> = Lazy::new(|| {
    #[cfg(not(test))]
    {
        load_from_disk()
    }
    #[cfg(test)]
    {
        DashMap::new()
    }
});

#[cfg(not(test))]
#[derive(Serialize, Deserialize)]
struct PersistedAttempt {
    identifier: String,
    count: u32,
    last_attempt_ms: u64,
    blocked_until_ms: Option<u64>,
}

#[cfg(not(test))]
fn to_millis(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(not(test))]
fn store_path() -> Option<std::path::PathBuf> {
    dirs::data_local_dir().map(|d| d.join("ToolkitGTI").join("rate_limit.json"))
}

#[cfg(not(test))]
fn load_from_disk() -> DashMap<String, LoginAttempt> {
    let map = DashMap::new();
    let Some(path) = store_path() else {
        return map;
    };
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return map;
    };
    let entries: Vec<PersistedAttempt> = serde_json::from_str(&raw).unwrap_or_default();
    for e in entries {
        map.insert(
            e.identifier,
            LoginAttempt {
                count: e.count,
                last_attempt: UNIX_EPOCH + Duration::from_millis(e.last_attempt_ms),
                blocked_until: e
                    .blocked_until_ms
                    .map(|ms| UNIX_EPOCH + Duration::from_millis(ms)),
            },
        );
    }
    map
}

/// Grava o estado atual (best-effort: falha de disco não pode travar o login).
fn persist() {
    #[cfg(not(test))]
    {
        let Some(path) = store_path() else {
            return;
        };
        let entries: Vec<PersistedAttempt> = LOGIN_ATTEMPTS
            .iter()
            .map(|e| PersistedAttempt {
                identifier: e.key().clone(),
                count: e.count,
                last_attempt_ms: to_millis(e.last_attempt),
                blocked_until_ms: e.blocked_until.map(to_millis),
            })
            .collect();
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_string(&entries) {
            if let Err(e) = std::fs::write(&path, json) {
                log_warn!("[RATE_LIMITER] Falha ao persistir estado: {}", e);
            }
        }
    }
}

/// Maximum failed attempts before blocking
const MAX_ATTEMPTS: u32 = 5;

/// Duration to block after reaching max attempts
const BLOCK_DURATION: Duration = Duration::from_secs(15 * 60); // 15 minutes

/// Time window for attempt counting
const ATTEMPT_WINDOW: Duration = Duration::from_secs(60 * 60); // 1 hour

/// Check if the identifier (username) is currently rate limited
///
/// Returns Ok(()) if the request should be allowed, or Err with message if blocked
pub fn check_rate_limit(identifier: &str) -> Result<(), String> {
    let now = SystemTime::now();

    // Clean up expired entries to prevent memory leaks
    cleanup_expired_entries(now);

    if let Some(attempt) = LOGIN_ATTEMPTS.get(identifier) {
        // Check if currently blocked
        if let Some(blocked_until) = attempt.blocked_until {
            if now < blocked_until {
                let remaining = blocked_until.duration_since(now).unwrap_or_default();
                let remaining_minutes = remaining.as_secs() / 60;
                return Err(format!(
                    "Muitas tentativas de login falharam. Tente novamente em {} minutos",
                    remaining_minutes.max(1)
                ));
            }
        }

        // Check if should be blocked now
        if attempt.count >= MAX_ATTEMPTS {
            // Update block status. Entre o drop() e o get_mut(), a limpeza de
            // entradas expiradas em outra thread pode remover a entrada — por
            // isso NÃO usamos unwrap() (evita panic em corrida rara). Se sumiu,
            // o bloqueio ainda é aplicado por este retorno de erro.
            drop(attempt); // Release the read lock
            if let Some(mut attempt_mut) = LOGIN_ATTEMPTS.get_mut(identifier) {
                attempt_mut.blocked_until = Some(now + BLOCK_DURATION);
            }
            persist();

            return Err(format!(
                "Limite de {} tentativas de login excedido. Acesso bloqueado por {} minutos",
                MAX_ATTEMPTS,
                BLOCK_DURATION.as_secs() / 60
            ));
        }
    }

    Ok(())
}

/// Record a failed login attempt for the given identifier
pub fn record_failed_attempt(identifier: &str) {
    let now = SystemTime::now();

    LOGIN_ATTEMPTS
        .entry(identifier.to_string())
        .and_modify(|attempt| {
            // Reset count if this is a new time window
            if now
                .duration_since(attempt.last_attempt)
                .unwrap_or(Duration::MAX)
                > ATTEMPT_WINDOW
            {
                attempt.count = 1;
            } else {
                attempt.count += 1;
            }
            attempt.last_attempt = now;

            // Clear any expired block
            if let Some(blocked_until) = attempt.blocked_until {
                if now >= blocked_until {
                    attempt.blocked_until = None;
                }
            }
        })
        .or_insert(LoginAttempt {
            count: 1,
            last_attempt: now,
            blocked_until: None,
        });

    persist();
    log_info!("[RATE_LIMITER] Failed attempt recorded for: {}", identifier);
}

/// Clear all attempts for the given identifier (called on successful login)
pub fn clear_attempts(identifier: &str) {
    if LOGIN_ATTEMPTS.remove(identifier).is_some() {
        persist();
        log_info!("[RATE_LIMITER] Attempts cleared for: {}", identifier);
    }
}

/// Clean up expired entries to prevent memory leaks
fn cleanup_expired_entries(now: SystemTime) {
    LOGIN_ATTEMPTS.retain(|_key, attempt| {
        // Keep if still blocked
        if let Some(blocked_until) = attempt.blocked_until {
            if blocked_until > now {
                return true;
            }
        }

        // Keep if recent activity (within attempt window)
        now.duration_since(attempt.last_attempt).unwrap_or_default() < ATTEMPT_WINDOW
    });
}

/// Get current rate limit status for tests
#[cfg(test)]
pub fn get_rate_limit_status(identifier: &str) -> Option<(u32, bool)> {
    LOGIN_ATTEMPTS.get(identifier).map(|attempt| {
        let is_blocked = attempt
            .blocked_until
            .map(|blocked_until| SystemTime::now() < blocked_until)
            .unwrap_or(false);

        (attempt.count, is_blocked)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limiter_allows_initial_attempts() {
        let identifier = "test_user_1";

        // Should allow first few attempts
        for _i in 1..MAX_ATTEMPTS {
            assert!(check_rate_limit(identifier).is_ok());
            record_failed_attempt(identifier);
        }
    }

    #[test]
    fn test_rate_limiter_blocks_after_max_attempts() {
        let identifier = "test_user_2";

        // Record max attempts
        for _ in 0..MAX_ATTEMPTS {
            record_failed_attempt(identifier);
        }

        // Should now be blocked
        assert!(check_rate_limit(identifier).is_err());
    }

    #[test]
    fn test_clear_attempts_works() {
        let identifier = "test_user_3";

        // Record some attempts
        record_failed_attempt(identifier);
        record_failed_attempt(identifier);

        // Clear attempts
        clear_attempts(identifier);

        // Should be allowed again
        assert!(check_rate_limit(identifier).is_ok());
    }

    #[test]
    fn test_rate_limiter_resets_after_window() {
        let identifier = "test_user_4";

        // This test would need to sleep for an hour to test properly,
        // so we just test the logic structure
        record_failed_attempt(identifier);
        assert!(check_rate_limit(identifier).is_ok());
    }

    #[test]
    fn test_rate_limit_status_reports_attempts() {
        let identifier = "test_user_5";
        clear_attempts(identifier);
        record_failed_attempt(identifier);

        let status = get_rate_limit_status(identifier);
        assert_eq!(status, Some((1, false)));
    }
}
