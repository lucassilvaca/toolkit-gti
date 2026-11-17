//! Standardized error handling for the application.
//!
//! Provides clean user-facing error messages while preserving detailed
//! technical information for debugging in development builds.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ApiError {
    pub message: String,
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl ApiError {
    pub fn new(message: &str, code: &str) -> Self {
        Self {
            message: message.to_string(),
            code: code.to_string(),
            details: None,
        }
    }

    pub fn with_details(mut self, details: &str) -> Self {
        #[cfg(debug_assertions)]
        {
            self.details = Some(details.to_string());
        }
        #[cfg(not(debug_assertions))]
        {
            let _ = details;
        }
        self
    }

    pub fn auth_required() -> Self {
        Self::new(
            "Autenticação necessária. Faça login para continuar",
            "AUTH_REQUIRED",
        )
    }

    pub fn permission_denied() -> Self {
        Self::new(
            "Acesso negado. Esta ação requer privilégios administrativos",
            "PERMISSION_DENIED",
        )
    }

    pub fn rate_limited(retry_after_minutes: u64) -> Self {
        Self::new(
            &format!(
                "Muitas tentativas. Tente novamente em {} minutos",
                retry_after_minutes
            ),
            "RATE_LIMITED",
        )
    }

    pub fn validation_error(field: &str) -> Self {
        Self::new(
            &format!("Erro de validação no campo: {}", field),
            "VALIDATION_ERROR",
        )
    }

    pub fn network_error() -> Self {
        Self::new(
            "Erro de conexão. Verifique sua rede e tente novamente",
            "NETWORK_ERROR",
        )
    }

    pub fn internal_error() -> Self {
        Self::new(
            "Erro interno do servidor. Tente novamente em alguns instantes",
            "INTERNAL_ERROR",
        )
    }

    pub fn command_failed(context: &str) -> Self {
        Self::new(&format!("Falha ao executar: {}", context), "COMMAND_FAILED")
    }

    pub fn config_error(context: &str) -> Self {
        Self::new(
            &format!("Erro de configuração: {}", context),
            "CONFIG_ERROR",
        )
    }

    pub fn pipe_error(context: &str) -> Self {
        Self::new(
            &format!("Erro de comunicação IPC: {}", context),
            "PIPE_ERROR",
        )
    }

    pub fn chat_error(context: &str) -> Self {
        Self::new(
            &format!("Erro no sistema de chat: {}", context),
            "CHAT_ERROR",
        )
    }

    pub fn maintenance_error(context: &str) -> Self {
        Self::new(
            &format!("Erro na tarefa de manutenção: {}", context),
            "MAINTENANCE_ERROR",
        )
    }

    pub fn session_expired() -> Self {
        Self::new("Sessão expirada. Faça login novamente", "SESSION_EXPIRED")
    }

    pub fn not_found(resource: &str) -> Self {
        Self::new(&format!("{} não encontrado", resource), "NOT_FOUND")
    }
}

impl From<std::io::Error> for ApiError {
    fn from(error: std::io::Error) -> Self {
        match error.kind() {
            std::io::ErrorKind::NotFound => {
                ApiError::new("Arquivo ou recurso não encontrado", "NOT_FOUND")
                    .with_details(&error.to_string())
            }
            std::io::ErrorKind::PermissionDenied => {
                ApiError::permission_denied().with_details(&error.to_string())
            }
            std::io::ErrorKind::ConnectionRefused => {
                ApiError::new("Conexão recusada", "CONNECTION_REFUSED")
                    .with_details(&error.to_string())
            }
            std::io::ErrorKind::TimedOut => {
                ApiError::network_error().with_details(&error.to_string())
            }
            _ => ApiError::internal_error().with_details(&error.to_string()),
        }
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(error: serde_json::Error) -> Self {
        ApiError::new("Erro de formato de dados", "JSON_ERROR").with_details(&error.to_string())
    }
}

impl From<tokio::task::JoinError> for ApiError {
    fn from(error: tokio::task::JoinError) -> Self {
        ApiError::internal_error().with_details(&error.to_string())
    }
}

impl From<ApiError> for String {
    fn from(error: ApiError) -> Self {
        match error.details {
            Some(_) => format!("{} (Código: {})", error.message, error.code),
            None => error.message,
        }
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

#[macro_export]
macro_rules! api_error {
    ($msg:expr, $code:expr) => {
        ApiError::new($msg, $code)
    };
    ($msg:expr, $code:expr, $details:expr) => {
        ApiError::new($msg, $code).with_details($details)
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_error_creation() {
        let error = ApiError::new("Test message", "TEST_CODE");
        assert_eq!(error.message, "Test message");
        assert_eq!(error.code, "TEST_CODE");
    }

    #[test]
    fn test_api_error_with_details() {
        let error = ApiError::new("Test", "TEST").with_details("Debug info");

        #[cfg(debug_assertions)]
        assert!(error.details.is_some());

        #[cfg(not(debug_assertions))]
        assert!(error.details.is_none());
    }

    #[test]
    fn test_predefined_errors() {
        let auth_error = ApiError::auth_required();
        assert_eq!(auth_error.code, "AUTH_REQUIRED");

        let perm_error = ApiError::permission_denied();
        assert_eq!(perm_error.code, "PERMISSION_DENIED");

        let rate_error = ApiError::rate_limited(15);
        assert_eq!(rate_error.code, "RATE_LIMITED");
        assert!(rate_error.message.contains("15"));
    }

    #[test]
    fn test_domain_errors() {
        assert_eq!(ApiError::command_failed("ping").code, "COMMAND_FAILED");
        assert_eq!(ApiError::config_error("port").code, "CONFIG_ERROR");
        assert_eq!(ApiError::pipe_error("connect").code, "PIPE_ERROR");
        assert_eq!(ApiError::chat_error("room").code, "CHAT_ERROR");
        assert_eq!(
            ApiError::maintenance_error("clean").code,
            "MAINTENANCE_ERROR"
        );
        assert_eq!(ApiError::session_expired().code, "SESSION_EXPIRED");
        assert_eq!(ApiError::not_found("room").code, "NOT_FOUND");
    }

    #[test]
    fn test_io_error_conversion() {
        let io_error = std::io::Error::new(std::io::ErrorKind::NotFound, "File not found");
        let api_error: ApiError = io_error.into();
        assert_eq!(api_error.code, "NOT_FOUND");
    }

    #[test]
    fn test_string_conversion() {
        let error = ApiError::auth_required();
        let s: String = error.into();
        assert!(s.contains("Autenticação"));
    }
}
