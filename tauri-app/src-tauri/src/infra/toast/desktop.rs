use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[cfg(windows)]
fn focus_chat_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("user-chat") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(windows)]
fn escape_xml_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

#[cfg(windows)]
fn path_to_toast_file_uri(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let raw = path
        .canonicalize()
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    let rest = raw.trim_start_matches('/');
    Some(format!("file:///{}", rest))
}

#[cfg(windows)]
fn resolve_toast_logo_path(app: &AppHandle) -> Option<PathBuf> {
    let try_icons = |base: PathBuf| {
        for name in ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"] {
            let p = base.join(name);
            if p.is_file() {
                return Some(p);
            }
        }
        None
    };
    app.path()
        .resource_dir()
        .ok()
        .and_then(try_icons)
        .or_else(|| {
            tauri::utils::platform::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(Path::to_path_buf))
                .and_then(try_icons)
        })
}

#[cfg(windows)]
fn show_via_current_process_notifier(
    app: &AppHandle,
    title: &str,
    subtitle: Option<&str>,
    body: &str,
) -> Result<(), String> {
    use std::thread;
    use std::time::Duration;
    use windows::core::{IInspectable, HSTRING};
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::TypedEventHandler;
    use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};

    let attribution = app
        .config()
        .product_name
        .as_deref()
        .unwrap_or("Toolkit GTI");

    let logo_xml = resolve_toast_logo_path(app)
        .as_deref()
        .and_then(path_to_toast_file_uri)
        .map(|uri| {
            format!(
                r#"<image placement="appLogoOverride" hint-crop="circle" src="{}" alt="" />"#,
                escape_xml_text(&uri)
            )
        })
        .unwrap_or_default();

    let mut lines = String::new();
    lines.push_str(&format!(
        r#"<text id="1" hint-style="title" hint-maxLines="2">{}</text>"#,
        escape_xml_text(title)
    ));
    if let Some(s) = subtitle.filter(|s| !s.is_empty()) {
        lines.push_str(&format!(
            r#"<text id="2" hint-style="subtitle" hint-maxLines="1">{}</text>"#,
            escape_xml_text(s)
        ));
    }
    lines.push_str(&format!(
        r#"<text id="3" hint-maxLines="4">{}</text>"#,
        escape_xml_text(body)
    ));
    let attr = escape_xml_text(attribution);
    let xml = format!(
        r##"<toast duration="long" scenario="default">
  <visual>
    <binding template="ToastGeneric">
      {logo_xml}
      {lines}
      <text placement="attribution">{attr}</text>
    </binding>
  </visual>
</toast>"##
    );

    let doc = XmlDocument::new().map_err(|e| e.to_string())?;
    doc.LoadXml(&HSTRING::from(xml))
        .map_err(|e| e.to_string())?;
    let toast = ToastNotification::CreateToastNotification(&doc).map_err(|e| e.to_string())?;
    let app_handle = app.clone();
    toast
        .Activated(&TypedEventHandler::<ToastNotification, IInspectable>::new(
            move |_, _| {
                focus_chat_window(&app_handle);
                Ok(())
            },
        ))
        .map_err(|e| e.to_string())?;
    let notifier = ToastNotificationManager::CreateToastNotifier().map_err(|e| e.to_string())?;
    notifier.Show(&toast).map_err(|e| e.to_string())?;
    thread::sleep(Duration::from_millis(10));
    Ok(())
}

#[tauri::command]
pub fn show_chat_desktop_toast(
    app: AppHandle,
    title: String,
    body: String,
    subtitle: Option<String>,
) -> Result<(), String> {
    let sub = subtitle.as_deref();
    #[cfg(windows)]
    {
        // Sem fallback via notify-rust/PowerShell no Windows: ele abria uma
        // janela de console visível. Com o AUMID registrado (ver `aumid.rs`) o
        // notifier nativo do processo é suficiente.
        show_via_current_process_notifier(&app, &title, sub, &body).map_err(|e| {
            log_warn!("show_chat_desktop_toast: notifier nativo falhou: {}", e);
            e
        })
    }
    #[cfg(not(windows))]
    {
        let merged = match sub.filter(|s| !s.is_empty()) {
            Some(s) => format!("{s}\n{body}"),
            None => body,
        };
        notify_rust::Notification::new()
            .summary(&title)
            .body(&merged)
            .show()
            .map_err(|e| format!("{e:?}"))
    }
}
