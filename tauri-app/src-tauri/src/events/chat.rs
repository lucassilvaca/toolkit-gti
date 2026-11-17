use crate::infra::named_pipe::types::url_encode;
use tauri::{
    window::Color, AppHandle, LogicalSize, Manager, Size, WebviewUrl, WebviewWindowBuilder,
};
use tauri_utils::config::BackgroundThrottlingPolicy;

const CHAT_WIDTH: f64 = 460.0;
const CHAT_HEIGHT: f64 = 640.0;
const CHAT_MIN_WIDTH: f64 = 380.0;
const CHAT_MIN_HEIGHT: f64 = 440.0;
const MONITOR_HORIZONTAL_MARGIN: f64 = 48.0;
const MONITOR_VERTICAL_MARGIN: f64 = 96.0;

fn chat_window_dimensions(app: &AppHandle) -> (f64, f64, f64, f64) {
    let Some(monitor) = app.primary_monitor().ok().flatten() else {
        return (CHAT_WIDTH, CHAT_HEIGHT, CHAT_MIN_WIDTH, CHAT_MIN_HEIGHT);
    };

    let work_area = monitor.work_area();
    chat_window_dimensions_for_area(
        work_area.size.width,
        work_area.size.height,
        monitor.scale_factor(),
    )
}

fn chat_window_dimensions_for_area(
    work_area_width: u32,
    work_area_height: u32,
    monitor_scale_factor: f64,
) -> (f64, f64, f64, f64) {
    let scale_factor = monitor_scale_factor.max(1.0);
    let available_width = work_area_width as f64 / scale_factor;
    let available_height = work_area_height as f64 / scale_factor;

    let width = CHAT_WIDTH.min((available_width - MONITOR_HORIZONTAL_MARGIN).max(280.0));
    let height = CHAT_HEIGHT.min((available_height - MONITOR_VERTICAL_MARGIN).max(320.0));

    (
        width,
        height,
        CHAT_MIN_WIDTH.min(width),
        CHAT_MIN_HEIGHT.min(height),
    )
}

/// Abre a janela de chat do usuário com os parâmetros da sessão.
///
/// Comando invocado diretamente pelo frontend (ChatInviteView) ao aceitar o convite.
/// Elimina o padrão anti-arquitetural de backend escutando eventos do frontend.
#[tauri::command]
pub async fn open_user_chat(
    app: AppHandle,
    room_id: String,
    ws_host: String,
    admin_name: String,
    token: String,
) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("chat-invite") {
        let _ = w.close();
    }

    // Token e nome do técnico incluídos na URL para exibição imediata no frontend.
    let url = format!(
        "user-chat.html?room={}&host={}&token={}&name={}",
        url_encode(&room_id),
        url_encode(&ws_host),
        url_encode(&token),
        url_encode(&admin_name)
    );
    log_debug!("open_user_chat: url={}", url);

    // A janela `user-chat` usa prevent_close + hide no X: após fechar, ela continua
    // existindo (oculta) com a label ocupada. Reaproveitá-la — navegando para a nova
    // sessão e reexibindo — é à prova de race. (destroy()+rebuild com a mesma label
    // falhava no Windows porque destroy é assíncrono: a janela não reabria.)
    if let Some(w) = app.get_webview_window("user-chat") {
        log_debug!("open_user_chat: reaproveitando janela user-chat existente");
        // SEGURANÇA (XSS): a URL contém dados controláveis pelo usuário (nome AD,
        // room_id). Interpolar direto em aspas simples permitiria injeção de JS se
        // algum componente contivesse `'`. `serde_json::to_string` produz um literal
        // JS devidamente escapado (aspas duplas + escaping), fechando o vetor.
        let url_literal =
            serde_json::to_string(&url).unwrap_or_else(|_| "\"user-chat.html\"".to_string());
        let nav_js = format!("window.location.replace({})", url_literal);
        if let Err(e) = w.eval(&nav_js) {
            log_error!("open_user_chat: falha ao navegar janela existente: {}", e);
        }
        clamp_existing_chat_window(&w);
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_always_on_top(true);
        if let Err(e) = w.set_focus() {
            log_error!("open_user_chat: falha ao focar janela existente: {}", e);
        }
        return Ok(());
    }

    let (width, height, min_width, min_height) = chat_window_dimensions(&app);

    match WebviewWindowBuilder::new(&app, "user-chat", WebviewUrl::App(url.into()))
        .title(format!("Chat — {}", admin_name))
        .inner_size(width, height)
        .min_inner_size(min_width, min_height)
        .always_on_top(true)
        // Barra nativa removida: o cabeçalho React faz o arrasto e a minimização.
        .decorations(false)
        .shadow(false)
        .background_color(Color(244, 248, 247, 255))
        .resizable(true)
        .focused(true)
        // Com a janela oculta (X), o WebView2 pode suspender o JS — WebSocket para de entregar.
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .center()
        .build()
    {
        Ok(_) => {
            log_debug!("user-chat window created");
            Ok(())
        }
        Err(e) => {
            log_error!("Failed to create user-chat window: {}", e);
            Err(format!("Falha ao abrir janela de chat: {}", e))
        }
    }
}

fn clamp_existing_chat_window(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };

    let scale_factor = monitor.scale_factor().max(1.0);
    let available_width = monitor.work_area().size.width as f64 / scale_factor;
    let available_height = monitor.work_area().size.height as f64 / scale_factor;
    let Ok(current_size) = window.inner_size() else {
        return;
    };

    let exceeds_width = current_size.width as f64 / scale_factor
        > (available_width - MONITOR_HORIZONTAL_MARGIN).max(280.0);
    let exceeds_height = current_size.height as f64 / scale_factor
        > (available_height - MONITOR_VERTICAL_MARGIN).max(320.0);

    if exceeds_width || exceeds_height {
        let (width, height, _, _) = chat_window_dimensions_for_area(
            monitor.work_area().size.width,
            monitor.work_area().size.height,
            monitor.scale_factor(),
        );
        if let Err(error) = window.set_size(Size::Logical(LogicalSize::new(width, height))) {
            log_error!(
                "open_user_chat: falha ao ajustar tamanho da janela: {}",
                error
            );
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn keeps_default_dimensions_for_normal_monitors() {
        assert_eq!(
            super::chat_window_dimensions_for_area(1200, 900, 1.0),
            (460.0, 640.0, 380.0, 440.0)
        );
    }

    #[test]
    fn reduces_dimensions_when_monitor_is_small() {
        assert_eq!(
            super::chat_window_dimensions_for_area(800, 600, 1.0),
            (460.0, 504.0, 380.0, 440.0)
        );
    }

    #[test]
    fn accounts_for_display_scaling() {
        let (width, height, min_width, min_height) =
            super::chat_window_dimensions_for_area(1280, 720, 1.5);

        assert_eq!(width, 460.0);
        assert_eq!(height, 384.0);
        assert_eq!(min_width, 350.0);
        assert_eq!(min_height, 384.0);
    }
}
