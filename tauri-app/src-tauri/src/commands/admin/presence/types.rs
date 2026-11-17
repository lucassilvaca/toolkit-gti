//! Tipos serializados para o frontend (`features/presence/types.ts`).

use serde::{Deserialize, Serialize};

/// Uma máquina da LAN na tabela de "usuários online".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineUser {
    pub ip: String,
    pub hostname: String,
    pub username: String,
    /// `true` = respondeu agora; `false` = só visto recentemente (cache).
    pub online: bool,
    /// `true` = a máquina roda o Toolkit (respondeu `/whoami`), então pode ser
    /// chamada para o chat. `false` = ligada, mas sem o Toolkit.
    pub has_toolkit: bool,
    /// Segundos desde o boot (só quando online e com Toolkit).
    pub uptime_secs: Option<u64>,
    /// Epoch (segundos) da última vez que respondeu.
    pub last_seen: Option<u64>,
}

/// Resultado de `scan_online_users`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    /// Faixas varridas em CIDR (ex.: "10.20.30.128/25 + 10.20.31.0/24").
    pub net: String,
    /// Quantidade de hosts sondados.
    pub probed: u16,
    pub users: Vec<OnlineUser>,
}

/// Resultado de `find_user_by_name`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserLookupResult {
    /// Nome buscado, normalizado.
    pub query: String,
    /// Faixas varridas em CIDR; vazio quando o histórico bastou.
    pub net: String,
    /// Quantidade de hosts sondados (histórico ou varredura).
    pub probed: u16,
    /// `true` quando a busca precisou varrer a sub-rede.
    pub scanned: bool,
    /// Máquinas que casaram com o nome, mais relevantes primeiro.
    pub matches: Vec<OnlineUser>,
}

/// Entrada persistida no cache de presença (`~/.toolkit_gti/presence_cache.json`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub hostname: String,
    pub username: String,
    /// Respondeu pelo Toolkit (chat possível) ou só via SMB. Caches antigos
    /// (sem o campo) só tinham máquinas com Toolkit.
    #[serde(default = "default_true")]
    pub has_toolkit: bool,
    /// Epoch (segundos) da última resposta.
    pub last_seen: u64,
}

/// Payload dos eventos de progresso (`presence-scan-progress`,
/// `presence-lookup-progress`).
#[derive(Debug, Clone, Copy, Serialize)]
pub struct ScanProgress {
    pub done: u16,
    pub total: u16,
}

fn default_true() -> bool {
    true
}
