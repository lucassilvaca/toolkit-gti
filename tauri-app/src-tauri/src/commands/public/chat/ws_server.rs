use super::room_manager::{RoomCreated, RoomManager};
use crate::commands::session::require_valid_session;
use crate::error_handling::ApiResult;
use crate::events::raise_alert;
use crate::infra::named_pipe::types::ChatInvitePayload;
use crate::infra::named_pipe::{is_lan_ip, shared_secret};
use crate::infra::net_auth;
use crate::infra::toast::display_chat_invite_window;
use crate::session::SessionsState;
use axum::body::Bytes;
use axum::http::HeaderMap;
use axum::{
    extract::{
        ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    response::Response,
    routing::{get, post},
    Json, Router,
};
use dashmap::{mapref::entry::Entry, DashMap};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State as TauriState};
use tokio::sync::broadcast;

// Limites de tamanho para campos recebidos pela rede (anti-DoS de UI).
const MAX_NAME_LEN: usize = 64;
const MAX_HOST_LEN: usize = 255;
const MAX_MESSAGE_LEN: usize = 2000;

/// Nonces já vistos (anti-replay fino, dentro da janela de `MAX_SKEW_SECS`).
/// Cada entrada guarda o instante de expiração; as vencidas são varridas
/// preguiçosamente a cada verificação — o volume é baixo (poucas requisições
/// por host numa janela de 60s).
#[derive(Default)]
pub struct NonceCache {
    seen: DashMap<String, u64>,
}

impl NonceCache {
    /// `true` se o nonce é inédito (aceito); `false` se já foi usado (replay).
    fn accept(&self, nonce: &str, now: u64, ttl: u64) -> bool {
        self.seen.retain(|_, exp| *exp > now);
        match self.seen.entry(nonce.to_string()) {
            Entry::Occupied(_) => false,
            Entry::Vacant(v) => {
                v.insert(now + ttl);
                true
            }
        }
    }
}

/// Valida a assinatura HMAC de uma requisição interna da LAN (H2) e barra
/// replay de nonce. Substitui o antigo header de segredo em claro: o segredo
/// nunca trafega, só a assinatura derivada dele.
fn verify_signed(state: &ServerAppState, headers: &HeaderMap, op: &str, body: &[u8]) -> bool {
    let secret = shared_secret();
    let get = |h: &str| headers.get(h).and_then(|v| v.to_str().ok());
    let now = net_auth::now_unix_secs();
    match net_auth::verify(
        &secret,
        get(net_auth::SIG_HEADER),
        get(net_auth::TS_HEADER),
        get(net_auth::NONCE_HEADER),
        op,
        body,
        now,
        net_auth::MAX_SKEW_SECS,
    ) {
        net_auth::SigVerdict::Valid => {
            let nonce = get(net_auth::NONCE_HEADER).unwrap_or_default();
            // TTL um pouco acima da janela para cobrir drift de relógio.
            state
                .nonce_cache
                .accept(nonce, now, net_auth::MAX_SKEW_SECS + 5)
        }
        _ => false,
    }
}

// log_info!, log_warn!, log_error!, log_debug! injected by #[macro_use] mod logging in lib.rs

// ─── Estado do servidor WebSocket ───────────────────────────────────────────

pub struct WsServerState {
    pub running: AtomicBool,
    pub room_manager: Arc<RoomManager>,
    pub janitor_handle: std::sync::Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

#[derive(Clone)]
struct ServerAppState {
    ws_state: Arc<WsServerState>,
    app: AppHandle,
    nonce_cache: Arc<NonceCache>,
}

#[derive(Debug, Deserialize, Serialize)]
struct InviteValidationRequest {
    room_id: String,
    room_token: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct InviteValidationResponse {
    ok: bool,
}

#[derive(Debug, Deserialize, Serialize)]
struct ReplyRequest {
    user_name: String,
    user_host: String,
    reply_message: String,
}

impl Default for WsServerState {
    fn default() -> Self {
        Self::new()
    }
}

impl WsServerState {
    pub fn new() -> Self {
        Self {
            running: AtomicBool::new(false),
            room_manager: Arc::new(RoomManager::new()),
            janitor_handle: std::sync::Mutex::new(None),
        }
    }

    pub fn new_room(&self) -> RoomCreated {
        self.room_manager.create_room()
    }

    pub fn start_janitor(self: &Arc<Self>) {
        // Recupera de PoisonError em vez de propagar panic para a thread principal
        // do Tauri: se a thread anterior entrou em panic segurando o lock, ainda
        // conseguimos ler/gravar o handle e manter o app vivo.
        let mut handle_guard = self
            .janitor_handle
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if handle_guard.is_none() {
            let handle =
                super::room_manager::RoomManager::start_janitor_for_arc(self.room_manager.clone());
            *handle_guard = Some(handle);
            log_info!("Room janitor started");
        }
    }

    pub fn stop_janitor(&self) {
        self.room_manager.stop_janitor();
        if let Ok(mut handle_guard) = self.janitor_handle.lock() {
            if let Some(handle) = handle_guard.take() {
                handle.abort();
                log_info!("Room janitor stopped");
            }
        }
    }
}

// ─── Comandos Tauri ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_chat_room(
    state: TauriState<'_, Arc<WsServerState>>,
    sessions: TauriState<'_, SessionsState>,
) -> ApiResult<RoomCreated> {
    require_valid_session(&sessions).await?;
    Ok(state.new_room())
}

#[tauri::command]
pub async fn get_chat_diagnostics(
    state: TauriState<'_, Arc<WsServerState>>,
    sessions: TauriState<'_, SessionsState>,
) -> ApiResult<super::room_manager::RoomDiagnostics> {
    require_valid_session(&sessions).await?;
    Ok(state.room_manager.get_diagnostics())
}

// ─── Boot do servidor WS ─────────────────────────────────────────────────────

pub async fn boot_ws_server(app: AppHandle, ws_state: Arc<WsServerState>, port: u16) {
    if ws_state.running.swap(true, Ordering::SeqCst) {
        log_warn!("WS server already running — boot skipped (double-start guard)");
        return;
    }

    // Start the room janitor for periodic cleanup
    ws_state.start_janitor();

    // 0.0.0.0 — aceita conexões em todas as interfaces (loopback + LAN)
    let bind_addr = format!("0.0.0.0:{port}");
    let listener = match tokio::net::TcpListener::bind(&bind_addr).await {
        Ok(l) => l,
        Err(e) => {
            let msg = format!("Falha ao iniciar servidor WS na porta {}: {}", port, e);
            log_error!("{}", msg);
            raise_alert(&app, "ws-server-error", msg);
            ws_state.running.store(false, Ordering::SeqCst);
            ws_state.stop_janitor(); // Stop janitor on server error
            return;
        }
    };

    log_info!("WS server listening on {}", bind_addr);

    let server_state = ServerAppState {
        ws_state: ws_state.clone(),
        app,
        nonce_cache: Arc::new(NonceCache::default()),
    };

    let router = Router::new()
        .route("/chat/:room_id", get(ws_handler))
        .route("/invite", post(receive_invite))
        .route("/invite/validate", post(validate_invite))
        .route("/reply", post(receive_reply))
        .route("/whoami", get(whoami))
        .with_state(server_state);

    if let Err(e) = axum::serve(listener, router).await {
        log_error!("WS server encerrado: {}", e);
    }

    // Stop janitor when server shuts down
    ws_state.stop_janitor();
    ws_state.running.store(false, Ordering::SeqCst);
}

// ─── Handler WS ─────────────────────────────────────────────────────────────

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(room_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<ServerAppState>,
) -> Response {
    let room_manager = state.ws_state.room_manager.clone();
    let provided_token = params.get("token").cloned().unwrap_or_default();

    // Get room and validate token through RoomManager
    let (sender, _stored_token) = match room_manager.get_room(&room_id, &provided_token) {
        Some(room_data) => room_data,
        None => {
            // Room not found or token invalid
            return ws.on_upgrade(|mut socket| async move {
                let _ = socket
                    .send(Message::Close(Some(CloseFrame {
                        code: 4404,
                        reason: "sala não encontrada ou token inválido".into(),
                    })))
                    .await;
            });
        }
    };

    // Check room capacity using room manager invariants
    if sender.receiver_count() >= super::room_manager::ROOM_MAX_CONNECTIONS {
        return ws.on_upgrade(|mut socket| async move {
            let _ = socket
                .send(Message::Close(Some(CloseFrame {
                    code: 4003,
                    reason: "sala cheia".into(),
                })))
                .await;
        });
    }

    // 14MB cobre 10MB binário → ~13,4MB base64 + overhead JSON
    ws.max_message_size(14 * 1024 * 1024)
        .on_upgrade(move |socket| handle_socket(socket, room_id, sender, room_manager))
}

async fn handle_socket(
    mut socket: WebSocket,
    room_id: String,
    sender: broadcast::Sender<String>,
    room_manager: Arc<RoomManager>,
) {
    let mut rx = sender.subscribe();

    // Mark room as fully connected when both peers are present
    if sender.receiver_count() >= super::room_manager::ROOM_MAX_CONNECTIONS {
        room_manager.mark_room_connected(&room_id);
        log_debug!(
            "Room {} fully connected ({} subscribers)",
            room_id,
            sender.receiver_count()
        );
    }

    // Heartbeat: envia Ping periódico e derruba conexões mortas (TCP half-open)
    // que não respondem dentro do timeout. Sem isso, um socket "fantasma" mantém
    // o receiver_count alto e trava a sala (rejeição 4003 ao reconectar).
    const PING_INTERVAL: Duration = Duration::from_secs(20);
    const DEAD_TIMEOUT: Duration = Duration::from_secs(50);
    let mut ping_interval = tokio::time::interval(PING_INTERVAL);
    ping_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut last_seen = Instant::now();

    // Main message loop
    loop {
        tokio::select! {
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        last_seen = Instant::now();
                        if sender.send(text.to_string()).is_err() {
                            log_debug!("Broadcast send failed in room {} (no receivers)", room_id);
                            break;
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        last_seen = Instant::now();
                        if socket.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Pong(_))) | Some(Ok(Message::Binary(_))) => {
                        last_seen = Instant::now();
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        log_debug!("WS connection closed in room {}", room_id);
                        break;
                    }
                    Some(Err(e)) => {
                        log_error!("WS receive error in room {}: {}", room_id, e);
                        break;
                    }
                }
            }
            result = rx.recv() => {
                match result {
                    Ok(msg) => {
                        if socket.send(Message::Text(msg)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        log_warn!("Room {} receiver lagged {} messages — slow client", room_id, n);
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            _ = ping_interval.tick() => {
                if last_seen.elapsed() > DEAD_TIMEOUT {
                    log_warn!(
                        "Room {} connection timed out (sem tráfego em {:?}) — encerrando fantasma",
                        room_id, DEAD_TIMEOUT
                    );
                    break;
                }
                if socket.send(Message::Ping(Vec::new())).await.is_err() {
                    break;
                }
            }
        }
    }

    // Cleanup: drop rx primeiro para decrementar receiver_count
    drop(rx);

    // Let RoomManager handle cleanup decision with proper invariants
    let was_removed = room_manager.cleanup_room(&room_id);
    if !was_removed && sender.receiver_count() == 0 {
        log_debug!(
            "Room {} empty but preserved (janitor will check later)",
            room_id
        );
    }
}

// ─── Testes ──────────────────────────────────────────────────────────────────

/// Presença: responde host + usuário Windows para a varredura de "usuários
/// online". Autenticado pelo segredo compartilhado (mesma proteção de /invite).
/// Inclui `uptime_secs` (tempo desde o boot) para a coluna "ligado há".
async fn whoami(
    State(state): State<ServerAppState>,
    headers: HeaderMap,
) -> Json<serde_json::Value> {
    if !verify_signed(&state, &headers, net_auth::OP_WHOAMI, &[]) {
        return Json(json!({ "ok": false }));
    }
    let hostname = std::env::var("COMPUTERNAME").unwrap_or_default();
    let username = std::env::var("USERNAME").unwrap_or_default();
    let uptime_secs = sysinfo::System::uptime();
    Json(json!({
        "ok": true,
        "hostname": hostname,
        "username": username,
        "uptime_secs": uptime_secs,
    }))
}

async fn receive_invite(
    State(state): State<ServerAppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Json<serde_json::Value> {
    // A2/H2: exige assinatura HMAC válida sobre o corpo — bloqueia convites de
    // máquinas aleatórias da LAN (pop-ups/phishing não autenticados) sem que o
    // segredo compartilhado trafegue na rede.
    if !verify_signed(&state, &headers, net_auth::OP_INVITE, &body) {
        log_warn!("Rejected /invite: assinatura ausente/inválida");
        return Json(json!({ "ok": false, "reason": "unauthorized" }));
    }

    let payload: ChatInvitePayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(_) => {
            log_warn!("Rejected /invite: corpo JSON inválido");
            return Json(json!({ "ok": false, "reason": "invalid_invite" }));
        }
    };

    // Limites de tamanho dos campos exibidos na janela de convite.
    if payload.admin_name.len() > MAX_NAME_LEN
        || payload.admin_host.len() > MAX_HOST_LEN
        || payload.message.as_deref().map(|m| m.len()).unwrap_or(0) > MAX_MESSAGE_LEN
    {
        log_warn!("Rejected /invite: field length limits exceeded");
        return Json(json!({ "ok": false, "reason": "payload_too_large" }));
    }

    let invite_is_valid = validate_invite_with_origin(&payload).await;
    if !invite_is_valid {
        log_warn!(
            "Rejected chat invite for room {} from {}@{} - origin validation failed",
            payload.room_id,
            payload.admin_name,
            payload.admin_host
        );
        return Json(json!({ "ok": false, "reason": "invalid_invite" }));
    }

    // Usuário já está em atendimento? A janela `user-chat` permanece viva (ainda
    // que minimizada) enquanto a conversa não é encerrada. Se existe, recusamos o
    // convite como "busy" e nem exibimos o popup — o técnico é avisado no retorno.
    if state.app.get_webview_window("user-chat").is_some() {
        log_info!(
            "Rejected chat invite for room {} from {}@{} - usuário já em atendimento",
            payload.room_id,
            payload.admin_name,
            payload.admin_host
        );
        return Json(json!({ "ok": false, "reason": "busy" }));
    }

    log_info!(
        "Received chat invite for room {} from {}@{}",
        payload.room_id,
        payload.admin_name,
        payload.admin_host
    );
    display_chat_invite_window(&state.app, payload);
    Json(json!({ "ok": true }))
}

async fn validate_invite(
    State(state): State<ServerAppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Json<InviteValidationResponse> {
    // Mesma auth (assinatura HMAC) dos demais endpoints internos.
    if !verify_signed(&state, &headers, net_auth::OP_INVITE_VALIDATE, &body) {
        log_warn!("Rejected /invite/validate: assinatura ausente/inválida");
        return Json(InviteValidationResponse { ok: false });
    }

    let payload: InviteValidationRequest = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(_) => return Json(InviteValidationResponse { ok: false }),
    };

    let ok = !payload.room_id.trim().is_empty()
        && !payload.room_token.trim().is_empty()
        && state
            .ws_state
            .room_manager
            .validate_room_token(&payload.room_id, &payload.room_token);

    Json(InviteValidationResponse { ok })
}

async fn validate_invite_with_origin(payload: &ChatInvitePayload) -> bool {
    if payload.room_id.trim().is_empty()
        || payload.room_token.trim().is_empty()
        || payload.admin_ip.trim().is_empty()
        || !(1024..=65535).contains(&payload.ws_port)
        // A1 (SSRF): o callback de validacao so pode ir para um IP de LAN.
        // Impede que um convite forjado faca o app contactar host arbitrario.
        || !is_lan_ip(&payload.admin_ip)
    {
        return false;
    }

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
    {
        Ok(client) => client,
        Err(e) => {
            log_error!("Failed to build invite validation client: {}", e);
            return false;
        }
    };

    let url = format!(
        "http://{}:{}/invite/validate",
        payload.admin_ip, payload.ws_port
    );
    let validation_request = InviteValidationRequest {
        room_id: payload.room_id.clone(),
        room_token: payload.room_token.clone(),
    };
    let body = match serde_json::to_vec(&validation_request) {
        Ok(body) => body,
        Err(e) => {
            log_error!("Falha ao serializar validação de convite: {}", e);
            return false;
        }
    };
    let signed = net_auth::sign_now(&shared_secret(), net_auth::OP_INVITE_VALIDATE, &body);

    match client
        .post(&url)
        .header(net_auth::TS_HEADER, &signed.ts)
        .header(net_auth::NONCE_HEADER, &signed.nonce)
        .header(net_auth::SIG_HEADER, &signed.sig)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body)
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            match response.json::<InviteValidationResponse>().await {
                Ok(body) => body.ok,
                Err(e) => {
                    log_warn!("Invite validation response parse failed for {}: {}", url, e);
                    false
                }
            }
        }
        Ok(response) => {
            log_warn!(
                "Invite validation failed for {} with status {}",
                url,
                response.status()
            );
            false
        }
        Err(e) => {
            log_warn!("Invite validation request failed for {}: {}", url, e);
            false
        }
    }
}

async fn receive_reply(
    State(state): State<ServerAppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Json<serde_json::Value> {
    // A2/H2: exige assinatura HMAC — sem ela, qualquer máquina da LAN poderia
    // disparar pop-ups arbitrários (phishing interno). O segredo não trafega.
    if !verify_signed(&state, &headers, net_auth::OP_REPLY, &body) {
        log_warn!("Rejected /reply: assinatura ausente/inválida");
        return Json(json!({ "ok": false, "reason": "unauthorized" }));
    }

    let payload: ReplyRequest = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(_) => return Json(json!({ "ok": false, "reason": "invalid_reply" })),
    };

    if payload.user_name.trim().is_empty()
        || payload.user_host.trim().is_empty()
        || payload.reply_message.trim().is_empty()
    {
        return Json(json!({ "ok": false, "reason": "invalid_reply" }));
    }

    // Limites de tamanho: evita pop-up gigante que sobrecarrega a UI.
    if payload.user_name.len() > MAX_NAME_LEN
        || payload.user_host.len() > MAX_HOST_LEN
        || payload.reply_message.len() > MAX_MESSAGE_LEN
    {
        log_warn!("Rejected /reply: field length limits exceeded");
        return Json(json!({ "ok": false, "reason": "payload_too_large" }));
    }

    log_info!(
        "Received reply from {}@{}",
        payload.user_name,
        payload.user_host
    );
    crate::infra::toast::show_reply_window_pub(
        &state.app,
        payload.user_name,
        payload.user_host,
        payload.reply_message,
    );
    Json(json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_server_state_creates_room_through_room_manager() {
        let state = WsServerState::new();
        let created = state.new_room();

        assert!(
            state.room_manager.rooms.contains_key(&created.room_id),
            "Room {} must exist in RoomManager after new_room()",
            created.room_id
        );
    }

    #[test]
    fn two_new_room_calls_return_distinct_ids() {
        let state = WsServerState::new();
        let c1 = state.new_room();
        let c2 = state.new_room();
        assert_ne!(c1.room_id, c2.room_id, "Each room must have a unique UUID");
    }

    #[test]
    fn two_new_room_calls_return_distinct_tokens() {
        let state = WsServerState::new();
        let c1 = state.new_room();
        let c2 = state.new_room();
        assert_ne!(c1.token, c2.token, "Each room must have a unique token");
    }

    #[test]
    fn room_manager_enforces_token_validation() {
        let state = WsServerState::new();
        let created = state.new_room();

        // Valid token should return room data
        assert!(
            state
                .room_manager
                .get_room(&created.room_id, &created.token)
                .is_some(),
            "Valid token should grant room access"
        );

        // Invalid token should be rejected
        assert!(
            state
                .room_manager
                .get_room(&created.room_id, "wrong-token")
                .is_none(),
            "Invalid token should be rejected"
        );
    }

    #[tokio::test]
    async fn janitor_lifecycle_management() {
        let state = std::sync::Arc::new(WsServerState::new());

        // Initially no janitor
        assert!(state.janitor_handle.lock().unwrap().is_none());

        // Start janitor
        state.start_janitor();
        assert!(state.janitor_handle.lock().unwrap().is_some());

        // Stop janitor
        state.stop_janitor();

        // Give some time for cleanup to complete
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        // After stopping, janitor should not be running anymore
        assert!(!state.room_manager.is_janitor_running());
    }
}
