//! Alertas do runtime que o técnico precisa ver: servidor do chat, regra de
//! firewall e named pipe.
//!
//! Esses problemas acontecem no startup, quase sempre antes de a janela
//! registrar o `listen` — o evento se perdia e a tela não avisava nada. Por
//! isso o último alerta de cada tipo fica guardado (`RuntimeAlerts`) e a tela
//! também o busca com `get_runtime_alerts` ao montar.

use serde::Serialize;
use std::collections::BTreeMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// Evento único dos alertas (`{ kind, message }`; `message` vazio = resolvido).
pub const RUNTIME_ALERT_EVENT: &str = "runtime-alert";

/// Tipos usados: `ws-server-error`, `firewall-error`, `firewall-warning`,
/// `pipe-error`. O frontend escolhe título e dica por tipo.
#[derive(Debug, Clone, Serialize)]
pub struct RuntimeAlert {
    pub kind: String,
    pub message: String,
}

/// Último alerta ativo por tipo (estado gerenciado pelo Tauri).
#[derive(Default)]
pub struct RuntimeAlerts(Mutex<BTreeMap<String, String>>);

fn store(app: &AppHandle, kind: &str, message: Option<&str>) {
    let Some(state) = app.try_state::<RuntimeAlerts>() else {
        return;
    };
    let Ok(mut alerts) = state.0.lock() else {
        return;
    };
    match message {
        Some(message) => alerts.insert(kind.to_string(), message.to_string()),
        None => alerts.remove(kind),
    };
}

/// Registra o alerta (vale para quem abrir a tela depois) e avisa quem já
/// está ouvindo.
pub fn raise_alert(app: &AppHandle, kind: &str, message: impl Into<String>) {
    let message = message.into();
    log_warn!("alerta [{}]: {}", kind, message);
    store(app, kind, Some(&message));
    let _ = app.emit(
        RUNTIME_ALERT_EVENT,
        RuntimeAlert {
            kind: kind.to_string(),
            message,
        },
    );
}

/// Marca o tipo como resolvido (ex.: regra de firewall criada depois).
pub fn clear_alert(app: &AppHandle, kind: &str) {
    store(app, kind, None);
    let _ = app.emit(
        RUNTIME_ALERT_EVENT,
        RuntimeAlert {
            kind: kind.to_string(),
            message: String::new(),
        },
    );
}

/// Alertas ativos agora (sem sessão: só diz o estado do próprio app).
#[tauri::command]
pub fn get_runtime_alerts(state: State<'_, RuntimeAlerts>) -> Vec<RuntimeAlert> {
    state
        .0
        .lock()
        .map(|alerts| {
            alerts
                .iter()
                .map(|(kind, message)| RuntimeAlert {
                    kind: kind.clone(),
                    message: message.clone(),
                })
                .collect()
        })
        .unwrap_or_default()
}
