use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Variável de ambiente com o nome do grupo (AD ou local) exigido no login do técnico.
pub const ADMIN_GROUP_ENV_VAR: &str = "TOOLKIT_ADMIN_GROUP";

/// Grupo exigido quando `TOOLKIT_ADMIN_GROUP` não está definido.
pub const DEFAULT_ADMIN_GROUP: &str = "GRP_TOOLKIT_ADMINS";

/// Limite de tamanho do nome de grupo aceito da variável de ambiente.
const MAX_ADMIN_GROUP_LEN: usize = 256;

/// Grupo exigido no login. Vazio ou maior que o limite cai no padrão.
///
/// O nome chega ao PowerShell por variável de ambiente e é comparado como dado
/// (`-contains`), nunca interpolado no script — por isso espaços são aceitos.
pub fn required_admin_group() -> String {
    std::env::var(ADMIN_GROUP_ENV_VAR)
        .ok()
        .map(|g| g.trim().to_string())
        .filter(|g| !g.is_empty() && g.chars().count() <= MAX_ADMIN_GROUP_LEN)
        .unwrap_or_else(|| DEFAULT_ADMIN_GROUP.to_string())
}

#[derive(serde::Serialize)]
pub struct AuthResult {
    pub success: bool,
    pub message: String,
    pub debug_info: String,
}

#[cfg(debug_assertions)]
fn dev_auth_bypass_enabled() -> bool {
    matches!(
        std::env::var("TOOLKIT_ALLOW_DEV_AUTH_BYPASS").as_deref(),
        Ok("1") | Ok("true") | Ok("TRUE")
    )
}

#[cfg(not(debug_assertions))]
fn dev_auth_bypass_enabled() -> bool {
    false
}

fn detailed_auth_diagnostics_enabled() -> bool {
    matches!(
        std::env::var("TOOLKIT_AUTH_DEBUG_INFO").as_deref(),
        Ok("1") | Ok("true") | Ok("TRUE")
    )
}

fn redact_sensitive_info(text: &str) -> String {
    text.lines()
        .map(|line| {
            let line_lower = line.to_lowercase();
            // Redact linhas que podem conter passwords ou informações sensíveis
            if line_lower.contains("password")
                || line_lower.contains("senha")
                || line_lower.contains("toolkit_auth_password")
                || line_lower.contains("credential")
                || line_lower.contains("token")
                || line.len() > 200
            {
                // Linhas muito longas podem conter dados sensíveis
                "[REDACTED - SENSITIVE INFO]"
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn build_debug_info(exit_code: i32, stdout: &str, stderr: &str) -> String {
    if !detailed_auth_diagnostics_enabled() {
        return String::new();
    }

    // Filtrar possíveis senhas dos logs antes de retornar
    let safe_stdout = redact_sensitive_info(stdout);
    let safe_stderr = redact_sensitive_info(stderr);

    format!(
        "Exit Code: {}\n\n=== STDOUT (FILTERED) ===\n{}\n\n=== STDERR (FILTERED) ===\n{}",
        exit_code, safe_stdout, safe_stderr
    )
}

fn validate_username(username: &str) -> Result<String, String> {
    let username_clean = username.trim();

    // Permitir apenas caracteres seguros para prevenir command injection
    if !username_clean
        .chars()
        .all(|c| c.is_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return Err("Username contém caracteres inválidos. Apenas letras, números, ponto, underscore e hífen são permitidos".to_string());
    }

    if username_clean.is_empty() || username_clean.len() > 64 {
        return Err("Username deve ter entre 1 e 64 caracteres".to_string());
    }

    Ok(username_clean.to_string())
}

pub fn get_current_user_impl() -> String {
    std::env::var("USERNAME").unwrap_or_default()
}

pub fn validate_credentials_detailed_impl(
    username: String,
    password: String,
) -> Result<AuthResult, String> {
    // DEV BYPASS: credenciais de teste (somente em debug builds).
    // Aceita admin/admin em qualquer build de desenvolvimento; em release
    // este bloco nem é compilado por causa do `#[cfg(debug_assertions)]`.
    // A variável TOOLKIT_ALLOW_DEV_AUTH_BYPASS continua funcionando como
    // atalho explícito, mas não é mais obrigatória.
    #[cfg(debug_assertions)]
    {
        let _ = dev_auth_bypass_enabled();
        if username.trim() == "admin" && password == "admin" {
            return Ok(AuthResult {
                success: true,
                message: "Login autorizado (modo desenvolvimento)".to_string(),
                debug_info: "Bypass de desenvolvimento (admin/admin) habilitado em debug build"
                    .to_string(),
            });
        }
    }

    // Validar e sanitizar username para prevenir command injection
    let user_clean = validate_username(&username)?;

    // Script PowerShell original que funcionava
    let ps_script = r#"
        Add-Type -AssemblyName System.DirectoryServices
        Add-Type -AssemblyName System.DirectoryServices.AccountManagement
        $ErrorActionPreference = "Stop"
        $user = $env:TOOLKIT_AUTH_USERNAME
        $password_plain = $env:TOOLKIT_AUTH_PASSWORD
        $requiredGroup = $env:TOOLKIT_AUTH_GROUP

        Write-Host "=== DEBUG INFO ==="
        Write-Host "Usuario: $user"
        Write-Host "=================="

        try {
            Write-Host "Método 1: Validação genérica..."
            $credential = New-Object System.Net.NetworkCredential($user, $password_plain)

            try {
                $domainContext = New-Object System.DirectoryServices.AccountManagement.PrincipalContext([System.DirectoryServices.AccountManagement.ContextType]::Domain)
                $domainValid = $domainContext.ValidateCredentials($user, $password_plain)
                Write-Host "Validação no DOMÍNIO: $domainValid"

                if ($domainValid) {
                    $ctx = $domainContext
                } else {
                    throw "Dominio falhou"
                }
            } catch {
                Write-Host "Falha no domínio, tentando local..."
                $localContext = New-Object System.DirectoryServices.AccountManagement.PrincipalContext([System.DirectoryServices.AccountManagement.ContextType]::Machine)
                $localValid = $localContext.ValidateCredentials($user, $password_plain)
                Write-Host "Validação LOCAL: $localValid"

                if ($localValid) {
                    $ctx = $localContext
                } else {
                    Write-Host "ERRO: Credenciais inválidas em ambos os contextos"
                    exit 1
                }
            }

            Write-Host "Buscando usuário..."
            $userObj = [System.DirectoryServices.AccountManagement.UserPrincipal]::FindByIdentity($ctx, $user)

            if ($null -eq $userObj) {
                Write-Host "ERRO: Usuário não encontrado"
                exit 2
            }

            Write-Host "Usuario encontrado: $($userObj.Name)"

            Write-Host "Verificando grupos..."
            $groups = @()
            try {
                $groups = $userObj.GetGroups() | Select-Object -ExpandProperty Name -First 50
            } catch {
                Write-Host "Método GetGroups falhou, tentando alternativa..."
                try {
                    $groups = $userObj.GetAuthorizationGroups() | Select-Object -ExpandProperty Name -First 50
                } catch {
                    Write-Host "Ambos os métodos falharam"
                }
            }

            Write-Host "Grupos encontrados: $($groups -join ', ')"

            if ($groups -contains $requiredGroup) {
                Write-Host "SUCESSO: Usuario possui $requiredGroup"
                exit 0
            } else {
                Write-Host "ERRO: Usuario NÃO possui $requiredGroup"
                exit 3
            }
        } catch {
            Write-Host "ERRO GERAL: $($_.Exception.Message)"
            Write-Host "Stack: $($_.ScriptStackTrace)"
            exit 5
        }
        "#;

    let admin_group = required_admin_group();

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .env("TOOLKIT_AUTH_USERNAME", &user_clean)
        .env("TOOLKIT_AUTH_PASSWORD", &password)
        .env("TOOLKIT_AUTH_GROUP", &admin_group)
        .output()
        .map_err(|e| format!("Falha ao executar PowerShell: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let exit_code = output.status.code().unwrap_or(-1);

    let debug_info = build_debug_info(exit_code, &stdout, &stderr);

    match exit_code {
        0 => Ok(AuthResult {
            success: true,
            message: "Login autorizado".to_string(),
            debug_info,
        }),
        1 => Ok(AuthResult {
            success: false,
            message: "Credenciais inválidas (verifique usuário/senha)".to_string(),
            debug_info,
        }),
        2 => Ok(AuthResult {
            success: false,
            message: "Usuário não encontrado no AD/local".to_string(),
            debug_info,
        }),
        3 => Ok(AuthResult {
            success: false,
            message: format!(
                "Usuario '{}' autenticado, mas NÃO possui o grupo {}",
                user_clean, admin_group
            ),
            debug_info,
        }),
        _ => Ok(AuthResult {
            success: false,
            message: "Erro na autenticação. Verifique o diagnóstico técnico.".to_string(),
            debug_info,
        }),
    }
}
