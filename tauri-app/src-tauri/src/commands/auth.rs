use crate::commands::auth_logic::get_current_user_impl;

/// Retorna o nome do usuario Windows logado (variavel de ambiente USERNAME).
#[tauri::command]
pub fn get_current_user() -> String {
    get_current_user_impl()
}

// NOTA DE SEGURANCA:
// `validate_credentials` e `validate_credentials_detailed` foram removidos do
// invoke_handler. A unica porta de entrada de autenticacao e o comando `login`
// (commands/session.rs), que aplica rate limiting via auth_rate_limiter.
// Expor validacao de credenciais diretamente permitia brute-force ilimitado
// contra o Active Directory. Nao reexponha esses comandos sem rate limiting.
