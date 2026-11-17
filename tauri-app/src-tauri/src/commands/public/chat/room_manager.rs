//! Room management module - separated from WebSocket transport logic.
//!
//! Responsibilities:
//! - Room lifecycle (create, cleanup, invariants)
//! - Room state management
//! - Periodic janitor for orphaned rooms

use dashmap::DashMap;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::sync::broadcast;
use uuid::Uuid;

// ─── Room Invariants and Limits ─────────────────────────────────────────────

/// Maximum time a room can exist without any connections (grace period)
pub const ROOM_GRACE_PERIOD: Duration = Duration::from_secs(60);

/// Backstop de tempo de vida — só se aplica a salas SEM conexões ativas.
/// Salas com atendimento em andamento nunca são coletadas por idade.
pub const ROOM_MAX_LIFETIME: Duration = Duration::from_secs(12 * 3600); // 12 horas

/// Maximum concurrent connections per room
pub const ROOM_MAX_CONNECTIONS: usize = 2;

/// Janitor cleanup interval
pub const JANITOR_INTERVAL: Duration = Duration::from_secs(30);

/// Maximum message broadcast buffer size
pub const ROOM_BROADCAST_BUFFER: usize = 32;

// ─── Room State ─────────────────────────────────────────────────────────────

pub struct RoomState {
    pub sender: broadcast::Sender<String>,
    pub token: String,
    created_at: Instant,
    last_activity: std::sync::Mutex<Instant>,
    fully_connected: AtomicBool,
}

impl RoomState {
    pub fn new(token: String) -> Self {
        let (sender, _rx) = broadcast::channel::<String>(ROOM_BROADCAST_BUFFER);
        let now = Instant::now();

        Self {
            sender,
            token,
            created_at: now,
            last_activity: std::sync::Mutex::new(now),
            fully_connected: AtomicBool::new(false),
        }
    }

    /// Updates the last activity timestamp
    pub fn touch_activity(&self) {
        if let Ok(mut last) = self.last_activity.lock() {
            *last = Instant::now();
        }
    }

    /// Marks room as fully connected (both peers have joined)
    pub fn mark_fully_connected(&self) {
        self.fully_connected.store(true, Ordering::Relaxed);
        self.touch_activity();
        log_debug!("Room marked as fully connected");
    }

    /// Checks if room should be removed based on various criteria
    pub fn should_remove(&self) -> bool {
        let receiver_count = self.sender.receiver_count();
        let age = self.created_at.elapsed();
        let was_fully_connected = self.fully_connected.load(Ordering::Relaxed);

        // Remove if no receivers and either was fully connected or grace period expired
        let empty_and_expired =
            receiver_count == 0 && (was_fully_connected || age > ROOM_GRACE_PERIOD);

        // Backstop de idade — APENAS para salas vazias. Uma sala com gente
        // conectada (atendimento ativo) nunca deve ser removida por idade.
        let exceeded_lifetime = receiver_count == 0 && age > ROOM_MAX_LIFETIME;

        // Remove if somehow exceeded connection limit (defensive)
        let exceeded_connections = receiver_count > ROOM_MAX_CONNECTIONS;

        if exceeded_lifetime {
            log_warn!(
                "Room exceeded maximum lifetime ({:?}), removing",
                ROOM_MAX_LIFETIME
            );
        }
        if exceeded_connections {
            log_error!(
                "Room exceeded connection limit ({} > {}), removing",
                receiver_count,
                ROOM_MAX_CONNECTIONS
            );
        }

        empty_and_expired || exceeded_lifetime || exceeded_connections
    }

    /// Gets room age for diagnostics
    pub fn age(&self) -> Duration {
        self.created_at.elapsed()
    }

    /// Gets time since last activity
    pub fn idle_time(&self) -> Duration {
        self.last_activity
            .lock()
            .map(|last| last.elapsed())
            .unwrap_or(self.age())
    }

    /// Checks if room has capacity for new connections
    pub fn has_capacity(&self) -> bool {
        self.sender.receiver_count() < ROOM_MAX_CONNECTIONS
    }
}

// ─── Room Creation Result ───────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct RoomCreated {
    pub room_id: String,
    pub token: String,
}

// ─── Room Manager ───────────────────────────────────────────────────────────

pub struct RoomManager {
    pub rooms: DashMap<String, RoomState>,
    janitor_running: AtomicBool,
}

impl Default for RoomManager {
    fn default() -> Self {
        Self::new()
    }
}

impl RoomManager {
    pub fn new() -> Self {
        Self {
            rooms: DashMap::new(),
            janitor_running: AtomicBool::new(false),
        }
    }

    /// Creates a new room with unique ID and token
    pub fn create_room(&self) -> RoomCreated {
        let room_id = Uuid::new_v4().to_string();
        let token = Uuid::new_v4().to_string();

        self.rooms
            .insert(room_id.clone(), RoomState::new(token.clone()));

        log_info!(
            "Chat room created: {} (total rooms: {})",
            room_id,
            self.rooms.len()
        );

        RoomCreated { room_id, token }
    }

    /// Gets room state if it exists and token matches
    pub fn get_room(
        &self,
        room_id: &str,
        token: &str,
    ) -> Option<(broadcast::Sender<String>, String)> {
        self.rooms.get(room_id).and_then(|entry| {
            let room = entry.value();
            if room.token == token {
                room.touch_activity();
                Some((room.sender.clone(), room.token.clone()))
            } else {
                log_warn!("Token mismatch for room {}", room_id);
                None
            }
        })
    }

    /// Validates whether a room exists and the token matches without mutating activity.
    pub fn validate_room_token(&self, room_id: &str, token: &str) -> bool {
        self.rooms
            .get(room_id)
            .map(|entry| entry.value().token == token)
            .unwrap_or(false)
    }

    /// Marks room as fully connected
    pub fn mark_room_connected(&self, room_id: &str) {
        if let Some(entry) = self.rooms.get(room_id) {
            entry.mark_fully_connected();
        }
    }

    /// Manually triggers cleanup for a specific room
    pub fn cleanup_room(&self, room_id: &str) -> bool {
        let should_remove = self
            .rooms
            .get(room_id)
            .map(|room| room.should_remove())
            .unwrap_or(false);

        if should_remove {
            self.rooms.remove(room_id);
            log_info!("Room {} removed by explicit cleanup", room_id);
            true
        } else {
            false
        }
    }

    /// Starts the periodic janitor task (requires RoomManager to be in Arc for safe sharing)
    pub fn start_janitor_for_arc(room_manager: Arc<Self>) -> tauri::async_runtime::JoinHandle<()> {
        if room_manager.janitor_running.swap(true, Ordering::SeqCst) {
            log_warn!("Janitor already running, ignoring start request");
            return tauri::async_runtime::spawn(async {}); // No-op task
        }

        let weak_ref = Arc::downgrade(&room_manager);

        tauri::async_runtime::spawn(async move {
            log_info!("Room janitor started (interval: {:?})", JANITOR_INTERVAL);

            let mut interval = tokio::time::interval(JANITOR_INTERVAL);
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            while let Some(manager) = weak_ref.upgrade() {
                if !manager.janitor_running.load(Ordering::Relaxed) {
                    break;
                }

                interval.tick().await;

                let mut removed_count = 0;
                let mut checked_count = 0;

                // Collect rooms to remove
                let to_remove: Vec<String> = manager
                    .rooms
                    .iter()
                    .filter_map(|entry| {
                        checked_count += 1;
                        if entry.value().should_remove() {
                            Some(entry.key().clone())
                        } else {
                            None
                        }
                    })
                    .collect();

                // Remove orphaned rooms
                for room_id in to_remove {
                    if manager.rooms.remove(&room_id).is_some() {
                        removed_count += 1;
                        log_debug!("Janitor removed orphaned room: {}", room_id);
                    }
                }

                if removed_count > 0 {
                    log_info!(
                        "Janitor cleanup: {} orphaned rooms removed ({} checked, {} remaining)",
                        removed_count,
                        checked_count,
                        manager.rooms.len()
                    );
                } else if checked_count > 0 {
                    // Só registra a varredura quando havia salas para checar.
                    // Sem salas (caso comum, ocioso) o log seria puro ruído a
                    // cada tick — poluía o console com "0 rooms checked".
                    log_debug!(
                        "Janitor sweep: {} rooms checked, {} healthy",
                        checked_count,
                        manager.rooms.len()
                    );
                }
            }

            log_info!("Room janitor stopped");
        })
    }

    /// Stops the janitor task
    pub fn stop_janitor(&self) {
        self.janitor_running.store(false, Ordering::SeqCst);
    }

    /// Checks if janitor is currently running
    pub fn is_janitor_running(&self) -> bool {
        self.janitor_running.load(Ordering::Relaxed)
    }

    /// Gets diagnostic information about all rooms
    pub fn get_diagnostics(&self) -> RoomDiagnostics {
        let mut total = 0;
        let mut active = 0;
        let mut empty = 0;
        let mut orphaned = 0;
        let mut oldest_age = Duration::ZERO;

        for entry in self.rooms.iter() {
            total += 1;
            let room = entry.value();
            let age = room.age();

            if age > oldest_age {
                oldest_age = age;
            }

            match room.sender.receiver_count() {
                0 => {
                    empty += 1;
                    if room.should_remove() {
                        orphaned += 1;
                    }
                }
                _ => active += 1,
            }
        }

        RoomDiagnostics {
            total,
            active,
            empty,
            orphaned,
            oldest_age,
            janitor_running: self.janitor_running.load(Ordering::Relaxed),
        }
    }
}

// ─── Diagnostics ────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct RoomDiagnostics {
    pub total: usize,
    pub active: usize,
    pub empty: usize,
    pub orphaned: usize,
    pub oldest_age: Duration,
    pub janitor_running: bool,
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{sleep, Duration};

    #[test]
    fn room_state_new_creates_with_defaults() {
        let token = "test-token".to_string();
        let room = RoomState::new(token.clone());

        assert_eq!(room.token, token);
        assert_eq!(room.sender.receiver_count(), 0);
        assert!(!room.fully_connected.load(Ordering::Relaxed));
        assert!(room.age() < Duration::from_secs(1));
    }

    #[test]
    fn room_state_should_not_remove_fresh_room() {
        let room = RoomState::new("token".to_string());
        assert!(!room.should_remove());
    }

    #[test]
    fn room_state_should_remove_after_full_connection_and_empty() {
        let room = RoomState::new("token".to_string());
        room.mark_fully_connected();
        // receiver_count is 0 in test (no actual subscribers)
        assert!(room.should_remove());
    }

    #[test]
    fn room_manager_creates_unique_rooms() {
        let manager = RoomManager::new();
        let room1 = manager.create_room();
        let room2 = manager.create_room();

        assert_ne!(room1.room_id, room2.room_id);
        assert_ne!(room1.token, room2.token);
        assert_eq!(manager.rooms.len(), 2);
    }

    #[test]
    fn room_manager_validates_token_access() {
        let manager = RoomManager::new();
        let created = manager.create_room();

        // Valid token should work
        assert!(manager.get_room(&created.room_id, &created.token).is_some());

        // Invalid token should fail
        assert!(manager.get_room(&created.room_id, "wrong-token").is_none());

        // Non-existent room should fail
        assert!(manager.get_room("non-existent", &created.token).is_none());
    }

    #[tokio::test]
    async fn janitor_removes_orphaned_rooms() {
        let manager = Arc::new(RoomManager::new());

        // Create a room and mark it as should be removed
        let created = manager.create_room();
        {
            let room = manager.rooms.get(&created.room_id).unwrap();
            room.mark_fully_connected();
            // receiver_count is 0, so should_remove() returns true
        }

        // Start janitor with short interval for testing
        let janitor_handle = RoomManager::start_janitor_for_arc(manager.clone());

        // Wait a bit for janitor to run
        sleep(Duration::from_millis(100)).await;

        // Room should be removed
        assert!(!manager.rooms.contains_key(&created.room_id));

        // Cleanup
        manager.stop_janitor();
        janitor_handle.abort();
    }
}
