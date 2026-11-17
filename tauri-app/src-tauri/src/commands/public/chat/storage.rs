//! File saving and chat history persistence.

use super::ChatMessage;
use crate::infra::net_guard::validate_host_target;
use std::path::{Component, Path, PathBuf};

const MAX_RECEIVED_FILE_BYTES: usize = 10 * 1024 * 1024;

fn sanitize_received_file_name(file_name: &str) -> Result<&str, String> {
    let path = Path::new(file_name);

    if path.as_os_str().is_empty() {
        return Err("Nome de arquivo vazio".to_string());
    }

    if file_name.contains(['\\', '/']) {
        return Err("Nome de arquivo contém caminho inválido".to_string());
    }

    let file_component = match path.file_name().and_then(|name| name.to_str()) {
        Some(name) if !name.is_empty() && name != "." && name != ".." => name,
        _ => return Err("Nome de arquivo inválido".to_string()),
    };

    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err("Nome de arquivo contém caminho inválido".to_string()),
        }
    }

    Ok(file_component)
}

/// Salva arquivo recebido em %USERPROFILE%\Downloads\Toolkit_GTI\
#[tauri::command]
pub async fn save_received_file(file_name: String, file_data: String) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    let safe_file_name = sanitize_received_file_name(&file_name)?;

    let data = general_purpose::STANDARD
        .decode(&file_data)
        .map_err(|e| format!("Erro ao decodificar arquivo: {}", e))?;

    if data.len() > MAX_RECEIVED_FILE_BYTES {
        return Err("Arquivo muito grande. Máximo: 10MB".to_string());
    }

    let userprofile =
        std::env::var("USERPROFILE").map_err(|_| "USERPROFILE não encontrado".to_string())?;

    let downloads = std::path::PathBuf::from(&userprofile)
        .join("Downloads")
        .join("Toolkit_GTI");

    tokio::fs::create_dir_all(&downloads).await.map_err(|e| {
        format!(
            "Erro ao criar diretório: {} (OS Error: {:?})",
            e,
            e.raw_os_error()
        )
    })?;

    let file_path = downloads.join(safe_file_name);
    tokio::fs::write(&file_path, data).await.map_err(|e| {
        format!(
            "Erro ao salvar arquivo: {} (OS Error: {:?})",
            e,
            e.raw_os_error()
        )
    })?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Caminho de %USERPROFILE%\Documents\Toolkit_GTI\chat_<id>.json.
///
/// SEGURANÇA (path traversal): `id` vem do front (room_id UUID ou IP) e vira
/// nome de arquivo; só aceita o charset de host (`[A-Za-z0-9._:-]`, ≤ 255).
fn chat_history_path(id: &str) -> Result<PathBuf, String> {
    let safe_id = validate_host_target(id)?;
    let dir = PathBuf::from(
        std::env::var("USERPROFILE").map_err(|_| "USERPROFILE não encontrado".to_string())?,
    )
    .join("Documents")
    .join("Toolkit_GTI");
    Ok(dir.join(format!("chat_{}.json", safe_id.replace(['.', ':'], "_"))))
}

/// Salva historico de conversa em %USERPROFILE%\Documents\Toolkit_GTI\chat_IP.json
#[tauri::command]
pub async fn save_chat_history(ip: String, messages: Vec<ChatMessage>) -> Result<(), String> {
    let path = chat_history_path(&ip)?;
    let dir = path.parent().ok_or("Diretório de histórico inválido")?;

    tokio::fs::create_dir_all(dir).await.map_err(|e| {
        format!(
            "Erro ao criar diretório: {} (OS Error: {:?})",
            e,
            e.raw_os_error()
        )
    })?;

    let json = serde_json::to_string_pretty(&messages).map_err(|e| e.to_string())?;

    tokio::fs::write(&path, json).await.map_err(|e| {
        format!(
            "Erro ao salvar histórico: {} (OS Error: {:?})",
            e,
            e.raw_os_error()
        )
    })
}

/// Carrega historico de conversa do disco. Retorna [] se nao existir.
#[tauri::command]
pub async fn load_chat_history(ip: String) -> Result<Vec<ChatMessage>, String> {
    let path = chat_history_path(&ip)?;

    if !tokio::fs::try_exists(&path).await.unwrap_or(false) {
        return Ok(vec![]);
    }

    let content = tokio::fs::read_to_string(&path).await.map_err(|e| {
        format!(
            "Erro ao ler histórico: {} (OS Error: {:?})",
            e,
            e.raw_os_error()
        )
    })?;

    serde_json::from_str::<Vec<ChatMessage>>(&content)
        .map_err(|e| format!("Erro ao parsear histórico: {}", e))
}

#[cfg(test)]
mod tests {
    use super::{chat_history_path, sanitize_received_file_name};

    #[test]
    fn chat_history_path_rejects_traversal() {
        assert!(chat_history_path("..\\..\\Windows\\x").is_err());
        assert!(chat_history_path("a/b").is_err());
        assert!(chat_history_path("").is_err());
    }

    #[test]
    fn chat_history_path_accepts_room_and_ip() {
        let p = chat_history_path("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert!(p.ends_with("chat_550e8400-e29b-41d4-a716-446655440000.json"));
        let p = chat_history_path("10.1.2.3").unwrap();
        assert!(p.ends_with("chat_10_1_2_3.json"));
    }

    #[test]
    fn accepts_plain_file_name() {
        assert_eq!(
            sanitize_received_file_name("arquivo.txt").unwrap(),
            "arquivo.txt"
        );
    }

    #[test]
    fn rejects_nested_or_absolute_paths() {
        assert!(sanitize_received_file_name("pasta\\arquivo.txt").is_err());
        assert!(sanitize_received_file_name("../arquivo.txt").is_err());
        assert!(sanitize_received_file_name("C:\\temp\\arquivo.txt").is_err());
    }

    #[test]
    fn rejects_special_segments() {
        assert!(sanitize_received_file_name("..").is_err());
        assert!(sanitize_received_file_name(".").is_err());
    }
}
