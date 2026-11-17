mod aumid;
mod desktop;

use super::named_pipe::types::ChatInvitePayload;
use tauri::{window::Color, AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub use aumid::{register_aumid, AUMID};
pub use desktop::show_chat_desktop_toast;

pub fn show_notification_window(
    app: &AppHandle,
    admin_name: String,
    admin_host: String,
    admin_ip: String,
    ws_port: u16,
    message: String,
    duration: u8,
) {
    log_debug!(
        "show_notification_window: {}@{} ({}) port {}: {}",
        admin_name,
        admin_host,
        admin_ip,
        ws_port,
        message
    );

    if let Some(w) = app.get_webview_window("popup-notification") {
        log_debug!("Closing existing popup-notification window");
        if let Err(e) = w.close() {
            log_error!("Failed to close existing popup-notification window: {}", e);
        }
    }

    match WebviewWindowBuilder::new(
        app,
        "popup-notification",
        WebviewUrl::App("popup-notification.html".into()),
    )
    .title("Notificação GTI")
    .inner_size(440.0, 290.0)
    .decorations(false)
    .shadow(false)
    .background_color(Color(244, 248, 247, 255))
    .always_on_top(true)
    .skip_taskbar(false)
    .resizable(false)
    .focused(true)
    .center()
    .build()
    {
        Ok(_) => {
            log_debug!("popup-notification window created successfully");
            let app_clone = app.clone();
            let payload = serde_json::json!({
                "admin_name": admin_name,
                "admin_host": admin_host,
                "admin_ip": admin_ip,
                "ws_port": ws_port,
                "message": message,
                "duration": duration,
            });
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;
                if let Some(w) = app_clone.get_webview_window("popup-notification") {
                    if let Err(e) = w.emit("notification-data", payload) {
                        log_error!("Failed to emit notification-data: {}", e);
                    }
                }
            });
        }
        Err(e) => {
            log_error!("Failed to create popup-notification window: {}", e);
        }
    }
}

pub fn show_reply_window(
    app: &AppHandle,
    user_name: String,
    user_host: String,
    reply_message: String,
) {
    log_debug!(
        "show_reply_window: {}@{}: {}",
        user_name,
        user_host,
        reply_message
    );

    if let Some(w) = app.get_webview_window("popup-reply") {
        log_debug!("Closing existing popup-reply window");
        if let Err(e) = w.close() {
            log_error!("Failed to close existing popup-reply window: {}", e);
        }
    }

    match WebviewWindowBuilder::new(
        app,
        "popup-reply",
        WebviewUrl::App("popup-reply.html".into()),
    )
    .title("Resposta do Usuário")
    .inner_size(400.0, 210.0)
    .decorations(false)
    .shadow(false)
    .background_color(Color(244, 248, 247, 255))
    .always_on_top(true)
    .skip_taskbar(false)
    .resizable(false)
    .focused(true)
    .center()
    .build()
    {
        Ok(_) => {
            log_debug!("popup-reply window created successfully");
            let app_clone = app.clone();
            let payload = serde_json::json!({
                "user_name": user_name,
                "user_host": user_host,
                "reply_message": reply_message,
            });
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;
                if let Some(w) = app_clone.get_webview_window("popup-reply") {
                    if let Err(e) = w.emit("reply-data", payload) {
                        log_error!("Failed to emit reply-data: {}", e);
                    }
                }
            });
        }
        Err(e) => {
            log_error!("Failed to create popup-reply window: {}", e);
        }
    }
}

pub fn show_reply_window_pub(
    app: &AppHandle,
    user_name: String,
    user_host: String,
    reply_message: String,
) {
    show_reply_window(app, user_name, user_host, reply_message);
}

// Espelha os campos do convite (nome/host/ip/room/token/porta); agrupar em struct
// só moveria o ruído. Allow intencional para manter o CI verde com -D warnings.
#[allow(clippy::too_many_arguments)]
pub fn show_chat_invite_window(
    app: &AppHandle,
    admin_name: String,
    admin_host: String,
    admin_ip: String,
    message: Option<String>,
    duration: u8,
    room_id: String,
    ws_port: u16,
    room_token: String,
) {
    log_debug!(
        "show_chat_invite_window: {}@{} ({}) room={}",
        admin_name,
        admin_host,
        admin_ip,
        room_id
    );

    if let Some(w) = app.get_webview_window("chat-invite") {
        let _ = w.close();
    }

    let msg_param = message.as_deref().unwrap_or("");
    let url = format!(
        "chat-invite.html?name={}&host={}&ip={}&msg={}&dur={}&room={}&ws_port={}&token={}",
        super::named_pipe::types::url_encode(&admin_name),
        super::named_pipe::types::url_encode(&admin_host),
        super::named_pipe::types::url_encode(&admin_ip),
        super::named_pipe::types::url_encode(msg_param),
        duration,
        super::named_pipe::types::url_encode(&room_id),
        ws_port,
        super::named_pipe::types::url_encode(&room_token),
    );

    match WebviewWindowBuilder::new(app, "chat-invite", WebviewUrl::App(url.into()))
        .title("Chat - GTI")
        .inner_size(400.0, message.as_ref().map(|_| 330.0).unwrap_or(280.0))
        .decorations(false)
        .shadow(false)
        .background_color(Color(244, 248, 247, 255))
        .always_on_top(true)
        .skip_taskbar(false)
        .resizable(false)
        .focused(true)
        .center()
        .build()
    {
        Ok(_) => log_debug!("chat-invite window created"),
        Err(e) => log_error!("Failed to create chat-invite window: {}", e),
    }
}

pub fn display_chat_invite_window(app: &AppHandle, payload: ChatInvitePayload) {
    show_chat_invite_window(
        app,
        payload.admin_name,
        payload.admin_host,
        payload.admin_ip,
        payload.message,
        payload.duration,
        payload.room_id,
        payload.ws_port,
        payload.room_token,
    );
}
