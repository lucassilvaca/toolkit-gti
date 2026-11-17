use crate::commands::session::require_valid_session;
use crate::error_handling::{ApiError, ApiResult};
use crate::session::SessionsState;
use chrono::{DateTime, Duration, Local};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

// Estado para armazenar o caminho personalizado do log
pub struct LogPathState(pub Mutex<Option<PathBuf>>);

const DEFAULT_LOG_FILENAME: &str = "Toolkit_Eventos.log";
const LOG_SEPARATOR: &str = "═══════════════════════════════════════════════════";

/// Obtém o caminho do arquivo de log
/// Usa o caminho personalizado se definido, senão usa Documentos/Toolkit_Eventos.log
fn get_log_path(app_handle: &AppHandle) -> PathBuf {
    // Tenta obter o caminho personalizado do estado
    if let Some(state) = app_handle.try_state::<LogPathState>() {
        if let Ok(guard) = state.0.lock() {
            if let Some(ref custom_path) = *guard {
                return custom_path.clone();
            }
        }
    }

    // Caminho padrão: Documentos do usuário
    let home_dir = dirs::document_dir().unwrap_or_else(|| PathBuf::from("."));
    home_dir.join(DEFAULT_LOG_FILENAME)
}

/// Limpa entradas de log com mais de 24 horas
fn cleanup_old_entries(content: &str) -> String {
    let now = Local::now();
    let cutoff = now - Duration::hours(24);

    let mut result = String::new();
    let mut current_entry = String::new();
    let mut lines = content.lines().peekable();
    let mut keep_entry = false;

    while let Some(line) = lines.next() {
        // Se encontrou um novo separador, processa a entrada anterior
        if line.starts_with("═══") && !current_entry.is_empty() {
            if keep_entry {
                if !result.is_empty() {
                    result.push('\n');
                }
                result.push_str(&current_entry);
            }
            current_entry.clear();
            keep_entry = false;
        }

        current_entry.push_str(line);
        current_entry.push('\n');

        // Verifica se a linha contém a data
        if line.starts_with(" Data:") {
            let date_str = line.replace(" Data:", "").trim().to_string();
            // Tenta parsear a data no formato brasileiro: "23/03/2026 14:32:15"
            if let Ok(entry_date) =
                DateTime::parse_from_str(&format!("{} +00:00", date_str), "%d/%m/%Y %H:%M:%S %z")
            {
                let entry_date_local = entry_date.with_timezone(&Local);
                keep_entry = entry_date_local > cutoff;
            }
        }

        // Se for a última linha, processa a entrada atual
        if lines.peek().is_none() && !current_entry.is_empty() && keep_entry {
            if !result.is_empty() {
                result.push('\n');
            }
            result.push_str(&current_entry);
        }
    }

    result
}

/// Adiciona uma entrada de log ao arquivo
#[tauri::command]
pub async fn append_log_entry(
    app_handle: AppHandle,
    entry: String,
    sessions: State<'_, SessionsState>,
) -> ApiResult<()> {
    require_valid_session(&sessions).await?;
    let log_path = get_log_path(&app_handle);

    // Lê o conteúdo atual e limpa entradas antigas
    let mut existing_content = String::new();
    if log_path.exists() {
        if let Ok(content) = fs::read_to_string(&log_path) {
            existing_content = cleanup_old_entries(&content);
        }
    }

    // Parseia a entrada recebida (formato: "time - [TYPE] action")
    let parts: Vec<&str> = entry.split(" - ").collect();
    if parts.len() >= 2 {
        let time = parts[0];
        let rest = parts[1];

        // Extrai tipo e ação
        let (tipo, acao) = if rest.starts_with('[') {
            let end_idx = rest.find(']').unwrap_or(rest.len());
            let tipo_raw = &rest[1..end_idx];
            let acao_raw = &rest[end_idx + 1..].trim();
            (tipo_raw.to_uppercase(), acao_raw.to_string())
        } else {
            ("INFO".to_string(), rest.to_string())
        };

        // Formata a nova entrada no estilo Opção B
        let formatted_entry = format!(
            "{}\n Data: {}\n Tipo: {}\n Acao: {}\n{}\n",
            LOG_SEPARATOR, time, tipo, acao, "───────────────────────────────────────────────────"
        );

        // Combina com o conteúdo existente filtrado
        let final_content = if existing_content.is_empty() {
            formatted_entry
        } else {
            format!("{}{}", existing_content, formatted_entry)
        };

        // Escreve no arquivo
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&log_path)?;

        file.write_all(final_content.as_bytes())?;
    }

    Ok(())
}

/// Define o caminho personalizado para o arquivo de log
#[tauri::command]
pub async fn set_log_path(
    app_handle: AppHandle,
    path: Option<String>,
    sessions: State<'_, SessionsState>,
) -> ApiResult<()> {
    require_valid_session(&sessions).await?;
    if let Some(state) = app_handle.try_state::<LogPathState>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = path.map(PathBuf::from);
        }
    }
    Ok(())
}

/// Obtém o caminho atual do arquivo de log
#[tauri::command]
pub async fn get_log_path_cmd(
    app_handle: AppHandle,
    sessions: State<'_, SessionsState>,
) -> ApiResult<String> {
    require_valid_session(&sessions).await?;
    let path = get_log_path(&app_handle);
    Ok(path.to_string_lossy().to_string())
}

/// Abre diálogo para selecionar pasta e retorna o caminho completo do arquivo
#[tauri::command]
pub async fn select_log_directory(
    app_handle: AppHandle,
    sessions: State<'_, SessionsState>,
) -> ApiResult<Option<String>> {
    require_valid_session(&sessions).await?;
    use tauri_plugin_dialog::DialogExt;

    // Abre o diálogo de seleção de pasta
    let folder_path = app_handle.dialog().file().blocking_pick_folder();

    if let Some(path) = folder_path {
        // Converte FilePath para String
        let path_str = path.to_string();
        // Adiciona o nome do arquivo ao path selecionado
        let log_path = std::path::Path::new(&path_str).join(DEFAULT_LOG_FILENAME);
        let log_path_str = log_path.to_string_lossy().to_string();

        // Atualiza o estado
        if let Some(state) = app_handle.try_state::<LogPathState>() {
            if let Ok(mut guard) = state.0.lock() {
                *guard = Some(log_path.clone());
            }
        }

        return Ok(Some(log_path_str));
    }

    Ok(None)
}

/// Exporta o histórico de auditoria para um `.txt` escolhido pelo usuário.
///
/// O "Salvar como" nativo e a escrita em disco precisam ser feitos pelo Rust:
/// dentro do WebView2 o download do navegador é ignorado pelo Tauri.
/// Retorna o caminho salvo, ou `None` se o usuário cancelou o diálogo.
#[tauri::command]
pub async fn export_logs(
    app_handle: AppHandle,
    content: String,
    default_name: String,
    sessions: State<'_, SessionsState>,
) -> ApiResult<Option<String>> {
    require_valid_session(&sessions).await?;
    use tauri_plugin_dialog::DialogExt;

    // Só o nome do arquivo: descarta qualquer componente de caminho vindo do JS.
    let file_name = std::path::Path::new(&default_name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| "toolkit_logs.txt".to_string());

    let picked = app_handle
        .dialog()
        .file()
        .set_file_name(&file_name)
        .add_filter("Texto", &["txt"])
        .blocking_save_file();

    match picked {
        Some(path) => {
            let path_str = path.to_string();
            fs::write(&path_str, content.as_bytes()).map_err(ApiError::from)?;
            Ok(Some(path_str))
        }
        None => Ok(None),
    }
}

/// Lê todo o conteúdo do arquivo de log
#[tauri::command]
pub async fn read_log_file(
    app_handle: AppHandle,
    sessions: State<'_, SessionsState>,
) -> ApiResult<String> {
    require_valid_session(&sessions).await?;
    let log_path = get_log_path(&app_handle);

    if !log_path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&log_path).map_err(ApiError::from)
}
