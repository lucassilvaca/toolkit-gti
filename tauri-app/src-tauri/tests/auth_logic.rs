#[path = "../src/commands/auth_logic.rs"]
mod auth_logic;

use auth_logic::{
    get_current_user_impl, required_admin_group, validate_credentials_detailed_impl, AuthResult,
    ADMIN_GROUP_ENV_VAR, DEFAULT_ADMIN_GROUP,
};
use std::sync::{Mutex, OnceLock};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn acquire_env_lock() -> std::sync::MutexGuard<'static, ()> {
    match env_lock().lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

#[test]
fn auth_result_success_fields() {
    let r = AuthResult {
        success: true,
        message: "Login autorizado".to_string(),
        debug_info: "info".to_string(),
    };
    assert!(r.success);
    assert_eq!(r.message, "Login autorizado");
}

#[test]
fn auth_result_failure_fields() {
    let r = AuthResult {
        success: false,
        message: "Credenciais invalidas".to_string(),
        debug_info: String::new(),
    };
    assert!(!r.success);
}

#[test]
fn validate_credentials_detailed_returns_structured_result() {
    let _guard = acquire_env_lock();
    std::env::remove_var("TOOLKIT_ALLOW_DEV_AUTH_BYPASS");
    let result = validate_credentials_detailed_impl(
        "__invalid_user__".to_string(),
        "__invalid_password__".to_string(),
    );
    assert!(result.is_ok());
    let auth = result.unwrap();
    assert!(!auth.message.is_empty());
}

#[test]
fn validate_credentials_allows_bypass_only_when_env_enabled() {
    let _guard = acquire_env_lock();
    std::env::set_var("TOOLKIT_ALLOW_DEV_AUTH_BYPASS", "1");
    let result = validate_credentials_detailed_impl("admin".to_string(), "admin".to_string());
    std::env::remove_var("TOOLKIT_ALLOW_DEV_AUTH_BYPASS");

    assert!(result.is_ok());
    let auth = result.unwrap();
    assert!(auth.success);
    assert!(auth.message.contains("desenvolvimento"));
}

#[test]
fn validate_credentials_hides_debug_info_by_default() {
    let _guard = acquire_env_lock();
    std::env::remove_var("TOOLKIT_ALLOW_DEV_AUTH_BYPASS");
    std::env::remove_var("TOOLKIT_AUTH_DEBUG_INFO");

    // Usa credenciais invalidas (e nao o atalho admin/admin) para exercitar o
    // caminho REAL de validacao: la o debug_info so e populado quando
    // TOOLKIT_AUTH_DEBUG_INFO esta ligado. admin/admin cai no bypass de debug,
    // que sempre traz uma mensagem propria e nao testa essa regra.
    let result = validate_credentials_detailed_impl(
        "__invalid_user__".to_string(),
        "__invalid_password__".to_string(),
    );
    assert!(result.is_ok());
    let auth = result.unwrap();
    assert!(auth.debug_info.is_empty());
}

#[test]
fn validate_credentials_can_enable_debug_info_explicitly() {
    let _guard = acquire_env_lock();
    std::env::remove_var("TOOLKIT_ALLOW_DEV_AUTH_BYPASS");
    std::env::set_var("TOOLKIT_AUTH_DEBUG_INFO", "1");

    let result = validate_credentials_detailed_impl(
        "__invalid_user__".to_string(),
        "__invalid_password__".to_string(),
    );

    std::env::remove_var("TOOLKIT_AUTH_DEBUG_INFO");

    assert!(result.is_ok());
    let auth = result.unwrap();
    assert!(auth.debug_info.contains("Exit Code"));
}

#[test]
fn get_current_user_returns_string() {
    let _user = get_current_user_impl();
}

#[test]
fn admin_group_comes_from_env_with_generic_default() {
    let _guard = acquire_env_lock();

    std::env::remove_var(ADMIN_GROUP_ENV_VAR);
    assert_eq!(required_admin_group(), DEFAULT_ADMIN_GROUP);

    std::env::set_var(ADMIN_GROUP_ENV_VAR, "  GRP Suporte N2  ");
    assert_eq!(required_admin_group(), "GRP Suporte N2");

    // Vazio ou absurdo de longo cai no padrão em vez de exigir um grupo inválido.
    std::env::set_var(ADMIN_GROUP_ENV_VAR, "   ");
    assert_eq!(required_admin_group(), DEFAULT_ADMIN_GROUP);
    std::env::set_var(ADMIN_GROUP_ENV_VAR, "G".repeat(257));
    assert_eq!(required_admin_group(), DEFAULT_ADMIN_GROUP);

    std::env::remove_var(ADMIN_GROUP_ENV_VAR);
}
