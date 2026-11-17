//! Remaining lib.rs wiring extracted into small helpers.

use crate::{
    bootstrap::{initialize_chat_system, initialize_core_app, setup_system_tray},
    commands,
    session::SessionsState,
    startup::{check_firewall_status, check_port_availability, log_startup_diagnostics},
};
use tauri::{App, Emitter, LogicalSize, Manager, Size, WindowEvent};

/// Tamanho preferido da janela principal (lógico). Igual ao `tauri.conf.json`.
const MAIN_WINDOW_SIZE: (f64, f64) = (1280.0, 900.0);
/// Menor tamanho em que o layout continua utilizável. Igual ao `tauri.conf.json`.
const MAIN_WINDOW_MIN_SIZE: (f64, f64) = (1024.0, 640.0);
/// Fração da área útil (sem barra de tarefas) ocupada ao abrir em telas pequenas.
const MAIN_WINDOW_SCREEN_FILL: f64 = 0.92;

/// Calcula (tamanho, mínimo) da janela principal para uma área útil lógica.
/// O mínimo nunca passa da área útil — senão a janela não cabe na tela e não
/// pode ser reduzida (ex.: notebook 1920x1080 a 125% = 1536x816 úteis).
fn fit_main_window(area: (f64, f64)) -> ((f64, f64), (f64, f64)) {
    let min = (
        MAIN_WINDOW_MIN_SIZE.0.min(area.0),
        MAIN_WINDOW_MIN_SIZE.1.min(area.1),
    );
    let size = (
        MAIN_WINDOW_SIZE
            .0
            .min(area.0 * MAIN_WINDOW_SCREEN_FILL)
            .max(min.0),
        MAIN_WINDOW_SIZE
            .1
            .min(area.1 * MAIN_WINDOW_SCREEN_FILL)
            .max(min.1),
    );
    (size, min)
}

/// Ajusta a janela principal à área útil do monitor em que abriu e a centraliza.
fn fit_main_window_to_monitor(app: &App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let monitor = match window.current_monitor() {
        Ok(Some(monitor)) => monitor,
        _ => match window.primary_monitor() {
            Ok(Some(monitor)) => monitor,
            _ => {
                log_warn!("Monitor da janela principal não identificado; mantendo tamanho padrão");
                return;
            }
        },
    };

    let area = monitor
        .work_area()
        .size
        .to_logical::<f64>(monitor.scale_factor());
    let ((width, height), (min_width, min_height)) = fit_main_window((area.width, area.height));

    if let Err(e) =
        window.set_min_size(Some(Size::Logical(LogicalSize::new(min_width, min_height))))
    {
        log_warn!("Falha ao ajustar tamanho mínimo da janela principal: {}", e);
    }
    if let Err(e) = window.set_size(Size::Logical(LogicalSize::new(width, height))) {
        log_warn!("Falha ao ajustar tamanho da janela principal: {}", e);
    }
    if let Err(e) = window.center() {
        log_warn!("Falha ao centralizar janela principal: {}", e);
    }
    log_debug!(
        "Janela principal: {:.0}x{:.0} (mínimo {:.0}x{:.0}, área útil {:.0}x{:.0})",
        width,
        height,
        min_width,
        min_height,
        area.width,
        area.height
    );
}

pub fn run_startup_diagnostics(app: &App) {
    let diagnostic_port = commands::admin::network_config::load_chat_port(&app.handle().clone());
    log_startup_diagnostics();
    check_firewall_status(diagnostic_port);
    check_port_availability(diagnostic_port);
}

pub fn setup_application(app: &mut App, sessions_state: SessionsState) -> tauri::Result<()> {
    log_debug!("setup() called - initializing app state");

    // Registra o AUMID em HKCU para que o toast nativo do Windows sempre funcione
    // (evita o fallback via PowerShell, que abre uma janela de console visível).
    crate::infra::toast::register_aumid(app.handle());

    fit_main_window_to_monitor(app);

    run_startup_diagnostics(app);

    let ws_state = initialize_core_app(app, sessions_state);

    // O chat da LAN depende do segredo compartilhado (TOOLKIT_GTI_SECRET). Se
    // ele não estiver provisionado, o chat NÃO sobe — mas isso NÃO pode derrubar
    // o app inteiro: diagnóstico, ferramentas e o resto seguem funcionando. Por
    // isso NÃO propagamos o erro com `?` (que daria panic no `.expect()` do
    // `.run()` e fecharia o app no boot). Degradamos com aviso e um evento para
    // a UI poder sinalizar "chat indisponível".
    if let Err(e) = initialize_chat_system(app, ws_state) {
        log_error!(
            "Subsistema de chat indisponível: {e}. O app segue aberto. Provisione \
             TOOLKIT_GTI_SECRET (o mesmo valor em todas as máquinas) \
             para habilitar o chat da LAN."
        );
        let _ = app.handle().emit("chat-unavailable", e.to_string());
    }

    setup_system_tray(app)?;

    log_debug!("Step 13 COMPLETE: Setup done");
    log_info!("=== TAURI APP SETUP COMPLETE ===");
    Ok(())
}

pub fn handle_main_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "main" {
            log_debug!("Main window close requested - preventing close and hiding");
            api.prevent_close();
            if let Err(e) = window.emit("app-locked", ()) {
                log_error!("Failed to emit app-locked event: {}", e);
            }
            if let Err(e) = window.hide() {
                log_error!("Failed to hide window: {}", e);
            }
        } else if window.label() == "user-chat" {
            // O X do chat do usuário MINIMIZA para a barra de tarefas — nunca
            // esconde nem encerra. O usuário final só vê esta janela e não tem
            // bandeja/atalho; esconder (hide) faria a janela sumir da barra e ele
            // a perderia para sempre. Minimizada, ela continua na barra de tarefas
            // e o próprio usuário a restaura clicando nela. O encerramento real
            // (destroy) só ocorre quando o técnico encerra o atendimento ou após
            // 10 min de inatividade — ver UserChatView.
            log_debug!("User chat close requested - minimizando para a barra de tarefas");
            api.prevent_close();
            if let Err(e) = window.minimize() {
                log_error!("Failed to minimize user-chat window: {}", e);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monitor_grande_usa_tamanho_preferido() {
        let (size, min) = fit_main_window((1920.0, 1032.0));
        assert_eq!(size, MAIN_WINDOW_SIZE);
        assert_eq!(min, MAIN_WINDOW_MIN_SIZE);
    }

    #[test]
    fn notebook_125_por_cento_cabe_na_area_util() {
        // 1920x1080 a 125% = 1536x864 lógicos, 816 sem a barra de tarefas.
        let (size, min) = fit_main_window((1536.0, 816.0));
        assert_eq!(size.0, 1280.0);
        assert!(size.1 <= 816.0 && size.1 >= min.1);
        assert_eq!(min, MAIN_WINDOW_MIN_SIZE);
    }

    #[test]
    fn tela_menor_que_o_minimo_reduz_o_minimo() {
        let (size, min) = fit_main_window((1000.0, 560.0));
        assert_eq!(min, (1000.0, 560.0));
        assert_eq!(size, min);
    }
}
