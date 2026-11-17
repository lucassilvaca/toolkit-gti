//! System tray bootstrap extracted from `lib.rs`.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.unminimize() {
            log_error!("Failed to unminimize window: {}", e);
        }
        if let Err(e) = window.show() {
            log_error!("Failed to show window: {}", e);
        }
        if let Err(e) = window.set_focus() {
            log_error!("Failed to focus window: {}", e);
        }
        if let Err(e) = window.emit("app-unlocked", ()) {
            log_error!("Failed to emit app-unlocked event: {}", e);
        }
    }
}

pub fn show_preferred_window(app: &tauri::AppHandle) {
    // Prefer re-opening user chat when it exists (common flow for non-admin users).
    if let Some(user_chat) = app.get_webview_window("user-chat") {
        if let Err(e) = user_chat.unminimize() {
            log_error!("Failed to unminimize user-chat window: {}", e);
        }
        if let Err(e) = user_chat.show() {
            log_error!("Failed to show user-chat window: {}", e);
        }
        if let Err(e) = user_chat.set_focus() {
            log_error!("Failed to focus user-chat window: {}", e);
        }
        return;
    }

    show_main_window(app);
}

pub fn setup_system_tray(app: &mut tauri::App) -> tauri::Result<()> {
    log_debug!("Step 9: Creating system tray...");
    let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show", "Abrir Dashboard", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
    log_debug!("Step 9 COMPLETE: System tray menu created");

    log_debug!("Step 10: Building system tray icon...");
    let _tray = TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .ok_or_else(|| {
                    std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "Failed to get default window icon",
                    )
                })?
                .clone(),
        )
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                log_debug!("Tray menu: quit clicked");
                app.exit(0);
            }
            "show" => {
                log_debug!("Tray menu: show clicked");
                show_main_window(app);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                show_preferred_window(app);
            }
        })
        .build(app)?;
    log_debug!("Step 10 COMPLETE: System tray built");

    Ok(())
}
