//! Cache de "visto por último" (`~/.toolkit_gti/presence_cache.json`).
//!
//! Guarda, por IP, o hostname/usuário da última resposta de `/whoami`. A tabela
//! de usuários online usa isso para listar máquinas vistas recentemente (mas
//! offline agora) e a busca por nome usa como histórico de onde cada pessoa
//! já foi vista.

use super::probe::Probe;
use super::types::CacheEntry;
use std::collections::HashMap;
use std::path::PathBuf;

/// Cache indexado por IP.
pub type PresenceCache = HashMap<String, CacheEntry>;

/// Entradas mais velhas que isto saem do cache ("visto recentemente").
const CACHE_TTL_SECS: u64 = 7 * 24 * 60 * 60;

fn cache_path() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(|home| {
        PathBuf::from(home)
            .join(".toolkit_gti")
            .join("presence_cache.json")
    })
}

/// Epoch atual em segundos.
pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Lê o cache do disco, descartando entradas expiradas. Erros viram cache vazio.
pub fn load_cache() -> PresenceCache {
    let Some(path) = cache_path() else {
        return PresenceCache::new();
    };
    let mut cache: PresenceCache = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    let now = now_secs();
    cache.retain(|_, e| now.saturating_sub(e.last_seen) <= CACHE_TTL_SECS);
    cache
}

/// Grava o cache (best-effort; falha só gera aviso).
pub fn save_cache(cache: &PresenceCache) {
    let Some(path) = cache_path() else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    match serde_json::to_string_pretty(cache) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&path, json) {
                log_warn!("presence: falha ao gravar cache de presença: {}", e);
            }
        }
        Err(e) => log_warn!("presence: falha ao serializar cache de presença: {}", e),
    }
}

/// Registra no cache quem respondeu agora. Só máquinas identificáveis entram
/// (com Toolkit, ou achadas via SMB com usuário logado): "visto recentemente"
/// e a busca por login precisam de nome/usuário.
pub fn remember_probes(cache: &mut PresenceCache, probes: &[Probe], now: u64) {
    for p in probes
        .iter()
        .filter(|p| p.has_toolkit || !p.username.is_empty())
    {
        cache.insert(
            p.ip.clone(),
            CacheEntry {
                hostname: p.hostname.clone(),
                username: p.username.clone(),
                has_toolkit: p.has_toolkit,
                last_seen: now,
            },
        );
    }
}
