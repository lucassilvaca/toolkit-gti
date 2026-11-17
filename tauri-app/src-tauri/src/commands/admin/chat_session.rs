//! Chat session management for bidirectional communication.
//!
//! Manages chat sessions between admin (technician) and user (remote PC).
//! Each session has a unique ID, status tracking, and message history.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;
use tauri::{AppHandle, Emitter};

/// Status of a chat session
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChatSessionStatus {
    Pending,
    Active,
    Ended,
    Declined,
}

impl Default for ChatSessionStatus {
    fn default() -> Self {
        Self::Pending
    }
}

impl std::fmt::Display for ChatSessionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatSessionStatus::Pending => write!(f, "pending"),
            ChatSessionStatus::Active => write!(f, "active"),
            ChatSessionStatus::Ended => write!(f, "ended"),
            ChatSessionStatus::Declined => write!(f, "declined"),
        }
    }
}

/// Message in a chat session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub from: String,
    pub text: String,
    pub timestamp: String,
    #[serde(default)]
    pub local: bool,
    #[serde(default = "default_kind")]
    pub kind: String,
}

fn default_kind() -> String {
    "text".to_string()
}

/// A chat session between admin and user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub target_ip: String,
    pub admin_name: String,
    pub status: ChatSessionStatus,
    pub created_at: String,
    pub messages: Vec<ChatMessage>,
}

impl ChatSession {
    /// Create a new chat session
    pub fn new(target_ip: String, admin_name: String) -> Self {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        
        Self {
            id: format!("chat_{}_{}", target_ip.replace('.', "_"), timestamp),
            target_ip,
            admin_name,
            status: ChatSessionStatus::Pending,
            created_at: chrono::Utc::now().to_rfc3339(),
            messages: Vec::new(),
        }
    }
    
    /// Add a message to the session
    pub fn add_message(&mut self, message: ChatMessage) {
        self.messages.push(message);
    }
    
    /// Update session status
    pub fn set_status(&mut self, status: ChatSessionStatus) {
        self.status = status;
    }
}

/// Global manager for all chat sessions
pub struct ChatSessionManager {
    sessions: Arc<TokioMutex<HashMap<String, ChatSession>>>,
}

impl ChatSessionManager {
    /// Create a new session manager
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(TokioMutex::new(HashMap::new())),
        }
    }
    
    /// Create a new chat session and return its ID
    pub async fn create_session(&self, target_ip: String, admin_name: String) -> String {
        let session = ChatSession::new(target_ip.clone(), admin_name);
        let session_id = session.id.clone();
        
        let mut sessions = self.sessions.lock().await;
        sessions.insert(session_id.clone(), session);
        
        log_info!("Created chat session: {}", session_id);
        session_id
    }
    
    /// Get a session by ID
    pub async fn get_session(&self, session_id: &str) -> Option<ChatSession> {
        let sessions = self.sessions.lock().await;
        sessions.get(session_id).cloned()
    }
    
    /// Update session status
    pub async fn update_status(&self, session_id: &str, status: ChatSessionStatus) {
        let mut sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.set_status(status.clone());
            log_debug!("Session {} status updated to: {}", session_id, status);
        }
    }
    
    /// Add a message to a session
    pub async fn add_message(&self, session_id: &str, message: ChatMessage) {
        let mut sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.add_message(message);
        }
    }
    
    /// End a session
    pub async fn end_session(&self, session_id: &str) {
        self.update_status(session_id, ChatSessionStatus::Ended).await;
    }
    
    /// Get all active sessions
    pub async fn get_active_sessions(&self) -> Vec<ChatSession> {
        let sessions = self.sessions.lock().await;
        sessions
            .values()
            .filter(|s| {
                matches!(
                    s.status,
                    ChatSessionStatus::Active | ChatSessionStatus::Pending
                )
            })
            .cloned()
            .collect()
    }
    
    /// Remove a session
    pub async fn remove_session(&self, session_id: &str) {
        let mut sessions = self.sessions.lock().await;
        sessions.remove(session_id);
        log_debug!("Session {} removed", session_id);
    }
}

// Tauri Commands

/// Start a new chat session with a remote user
#[tauri::command]
pub async fn start_chat_session(
    target_ip: String,
    admin_name: String,
    app: AppHandle,
    state: tauri::State<'_, ChatSessionManager>,
) -> Result<String, String> {
    log_info!("Starting chat session with {} as {}", target_ip, admin_name);
    
    let session_id = state.create_session(target_ip.clone(), admin_name.clone()).await;
    
    // Emit event for UI
    app.emit(&format!("chat:session:{}:created", session_id), &session_id)
        .map_err(|e| format!("Failed to emit event: {}", e))?;
    
    Ok(session_id)
}

/// Send a chat invite to a remote user
#[tauri::command]
pub async fn send_chat_invite_cmd(
    session_id: String,
    message: String,
    app: AppHandle,
    state: tauri::State<'_, ChatSessionManager>,
) -> Result<(), String> {
    log_info!("Sending chat invite for session {}", session_id);
    
    let session = state.get_session(&session_id).await
        .ok_or_else(|| format!("Session {} not found", session_id))?;
    
    let invite_message = ChatMessage {
        from: session.admin_name.clone(),
        text: message.clone(),
        timestamp: chrono::Utc::now().format("%H:%M").to_string(),
        local: false,
        kind: "invite".to_string(),
    };
    
    // Add invite to session history
    state.add_message(&session_id, invite_message.clone()).await;
    
    // Emit event for UI to send via TCP
    app.emit(&format!("chat:invite:{}:{}", session.target_ip, session_id), &invite_message)
        .map_err(|e| format!("Failed to emit invite event: {}", e))?;
    
    Ok(())
}

/// Accept a chat invite (called by user)
#[tauri::command]
pub async fn accept_chat_invite(
    session_id: String,
    app: AppHandle,
    state: tauri::State<'_, ChatSessionManager>,
) -> Result<(), String> {
    log_info!("Accepting chat invite for session {}", session_id);
    
    state.update_status(&session_id, ChatSessionStatus::Active).await;
    
    // Emit event for UI
    app.emit(&format!("chat:session:{}:accepted", session_id), &session_id)
        .map_err(|e| format!("Failed to emit acceptance: {}", e))?;
    
    Ok(())
}

/// Decline a chat invite (called by user)
#[tauri::command]
pub async fn decline_chat_invite(
    session_id: String,
    app: AppHandle,
    state: tauri::State<'_, ChatSessionManager>,
) -> Result<(), String> {
    log_info!("Declining chat invite for session {}", session_id);
    
    state.update_status(&session_id, ChatSessionStatus::Declined).await;
    
    // Emit event for UI
    app.emit(&format!("chat:session:{}:declined", session_id), &session_id)
        .map_err(|e| format!("Failed to emit decline: {}", e))?;
    
    Ok(())
}

/// Send a message in an active session
#[tauri::command]
pub async fn send_session_message(
    session_id: String,
    from: String,
    message: String,
    app: AppHandle,
    state: tauri::State<'_, ChatSessionManager>,
) -> Result<(), String> {
    log_debug!("Sending message in session {}: {}", session_id, message);
    
    let chat_message = ChatMessage {
        from: from.clone(),
        text: message.clone(),
        timestamp: chrono::Utc::now().format("%H:%M").to_string(),
        local: true,
        kind: "text".to_string(),
    };
    
    // Add message to session
    state.add_message(&session_id, chat_message.clone()).await;
    
    // Emit event for UI
    app.emit(&format!("chat:session:{}:message", session_id), &chat_message)
        .map_err(|e| format!("Failed to emit message: {}", e))?;
    
    Ok(())
}

/// End a chat session
#[tauri::command]
pub async fn end_chat_session_cmd(
    session_id: String,
    app: AppHandle,
    state: tauri::State<'_, ChatSessionManager>,
) -> Result<(), String> {
    log_info!("Ending chat session {}", session_id);
    
    state.end_session(&session_id).await;
    
    // Emit event for UI
    app.emit(&format!("chat:session:{}:ended", session_id), &session_id)
        .map_err(|e| format!("Failed to emit end: {}", e))?;
    
    Ok(())
}

/// Get session details
#[tauri::command]
pub async fn get_chat_session(
    session_id: String,
    state: tauri::State<'_, ChatSessionManager>,
) -> Result<ChatSession, String> {
    state.get_session(&session_id).await
        .ok_or_else(|| format!("Session {} not found", session_id))
}

/// Get all active sessions
#[tauri::command]
pub async fn get_active_chat_sessions(
    state: tauri::State<'_, ChatSessionManager>,
) -> Result<Vec<ChatSession>, String> {
    Ok(state.get_active_sessions().await)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_session_creation() {
        let session = ChatSession::new("192.168.1.100".to_string(), "Técnico João".to_string());
        
        assert!(session.id.starts_with("chat_192_168_1_100_"));
        assert_eq!(session.target_ip, "192.168.1.100");
        assert_eq!(session.admin_name, "Técnico João");
        assert_eq!(session.status, ChatSessionStatus::Pending);
        assert!(session.messages.is_empty());
    }
    
    #[test]
    fn test_session_add_message() {
        let mut session = ChatSession::new("10.0.0.1".to_string(), "Admin".to_string());
        
        let msg = ChatMessage {
            from: "Admin".to_string(),
            text: "Olá!".to_string(),
            timestamp: "10:30".to_string(),
            local: true,
            kind: "text".to_string(),
        };
        
        session.add_message(msg);
        
        assert_eq!(session.messages.len(), 1);
        assert_eq!(session.messages[0].text, "Olá!");
    }
    
    #[test]
    fn test_session_status_display() {
        assert_eq!(ChatSessionStatus::Pending.to_string(), "pending");
        assert_eq!(ChatSessionStatus::Active.to_string(), "active");
        assert_eq!(ChatSessionStatus::Ended.to_string(), "ended");
        assert_eq!(ChatSessionStatus::Declined.to_string(), "declined");
    }
    
    #[tokio::test]
    async fn test_session_manager_operations() {
        let manager = ChatSessionManager::new();
        
        // Create session
        let session_id = manager.create_session("192.168.1.50".to_string(), "Admin".to_string()).await;
        
        // Get session
        let session = manager.get_session(&session_id).await;
        assert!(session.is_some());
        assert_eq!(session.unwrap().admin_name, "Admin");
        
        // Get active sessions
        let active = manager.get_active_sessions().await;
        assert_eq!(active.len(), 1);
        
        // Update status
        manager.update_status(&session_id, ChatSessionStatus::Active).await;
        let session = manager.get_session(&session_id).await.unwrap();
        assert_eq!(session.status, ChatSessionStatus::Active);
        
        // End session
        manager.end_session(&session_id).await;
        let session = manager.get_session(&session_id).await.unwrap();
        assert_eq!(session.status, ChatSessionStatus::Ended);
        
        // Active sessions should be empty now
        let active = manager.get_active_sessions().await;
        assert_eq!(active.len(), 0);
    }
}