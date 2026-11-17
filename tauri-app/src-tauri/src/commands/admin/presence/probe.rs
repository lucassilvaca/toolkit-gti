//! Sondagem de hosts: ICMP assíncrono (IcmpSendEcho2, sem admin), TCP (portas
//! Windows) e enriquecimento via `/whoami` autenticado — o endpoint que só as
//! máquinas com o Toolkit respondem. Compartilhado pela varredura e pela busca.

use super::networks::ScanTarget;
use super::smb::identify_via_smb;
use super::types::{OnlineUser, ScanProgress};
use crate::error_handling::{ApiError, ApiResult};
use crate::infra::named_pipe::shared_secret;
use crate::infra::net_auth;
use once_cell::sync::Lazy;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

/// Hosts sondados ao mesmo tempo. Uma /24 inteira cabe numa leva (igual ao
/// comportamento antigo); várias VLANs não abrem milhares de sockets de uma vez.
const MAX_CONCURRENT_PROBES: usize = 256;

/// Timeout do `/whoami` — curto o bastante para uma varredura /24 rápida na LAN.
const WHOAMI_TIMEOUT: Duration = Duration::from_millis(1500);
/// Timeout do eco ICMP (ms).
const ICMP_TIMEOUT_MS: u32 = 800;
/// Timeout de cada tentativa TCP.
const TCP_TIMEOUT: Duration = Duration::from_millis(500);
/// Portas típicas de estações Windows (SMB, RPC, RDP) — firewalls corporativos
/// costumam bloquear ICMP, mas não estas.
const WINDOWS_PORTS: [u16; 3] = [445, 135, 3389];
/// SMB: plano B para identificar máquinas sem Toolkit (`smb.rs`).
const SMB_PORT: u16 = 445;

/// Pinger único: o `AsyncPinger` sobe uma thread de IO compartilhada.
static PINGER: Lazy<winping::AsyncPinger> = Lazy::new(|| {
    let mut pinger = winping::AsyncPinger::new();
    pinger.set_timeout(ICMP_TIMEOUT_MS);
    pinger
});

/// Um host que respondeu à sonda.
#[derive(Debug, Clone)]
pub struct Probe {
    pub ip: String,
    pub hostname: String,
    /// Respondeu `/whoami` (roda o Toolkit).
    pub has_toolkit: bool,
    /// Usuário Windows logado (vazio sem Toolkit).
    pub username: String,
    pub uptime_secs: Option<u64>,
}

impl Probe {
    /// Linha da tabela para um host que respondeu agora.
    pub fn into_online_user(self, now: u64) -> OnlineUser {
        OnlineUser {
            ip: self.ip,
            hostname: self.hostname,
            username: self.username,
            online: true,
            has_toolkit: self.has_toolkit,
            uptime_secs: self.uptime_secs,
            last_seen: Some(now),
        }
    }
}

/// Cliente HTTP da varredura (timeout curto, sem proxy).
pub fn build_client() -> ApiResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(WHOAMI_TIMEOUT)
        .no_proxy()
        .build()
        .map_err(|e| ApiError::network_error().with_details(&e.to_string()))
}

async fn icmp_up(addr: Ipv4Addr) -> bool {
    let wait = Duration::from_millis(u64::from(ICMP_TIMEOUT_MS) + 200);
    match tokio::time::timeout(wait, PINGER.send4(addr, winping::Buffer::new())).await {
        Ok(reply) => reply.result.is_ok(),
        Err(_) => false,
    }
}

/// Porta aceita a conexão OU recusa ativamente (RST também prova que há uma
/// máquina respondendo naquele IP).
async fn port_answers(addr: Ipv4Addr, port: u16) -> bool {
    let target = SocketAddr::from((addr, port));
    match tokio::time::timeout(TCP_TIMEOUT, tokio::net::TcpStream::connect(target)).await {
        Ok(Ok(_)) => true,
        Ok(Err(e)) => e.kind() == std::io::ErrorKind::ConnectionRefused,
        Err(_) => false,
    }
}

/// Host ligado se alguma das portas típicas responder.
async fn tcp_up(addr: Ipv4Addr, ws_port: u16) -> bool {
    let mut set = JoinSet::new();
    for port in std::iter::once(ws_port).chain(WINDOWS_PORTS) {
        set.spawn(port_answers(addr, port));
    }
    while let Some(res) = set.join_next().await {
        if matches!(res, Ok(true)) {
            return true;
        }
    }
    false
}

/// Máquina sem resposta do Toolkit: plano B por SMB (445) para descobrir
/// hostname e usuário logado (`smb.rs`). `None` se a 445 não responde.
/// Com a 445 aberta mas sem permissão, devolve a máquina só com o IP.
async fn identify_without_toolkit(ip: String, addr: Ipv4Addr) -> Option<Probe> {
    if !port_answers(addr, SMB_PORT).await {
        return None;
    }
    let (hostname, username) = identify_via_smb(&ip).await.unwrap_or_default();
    Some(Probe {
        ip,
        hostname,
        has_toolkit: false,
        username,
        uptime_secs: None,
    })
}

/// Sonda um host: primeiro ping, depois TCP; se ligado, tenta `/whoami` para
/// enriquecer com nome/usuário e marcar `has_toolkit`; sem Toolkit, tenta o
/// plano B por SMB. `None` = desligado.
pub async fn probe_host(
    ip: String,
    ws_port: u16,
    client: reqwest::Client,
    secret: String,
) -> Option<Probe> {
    let addr: Ipv4Addr = ip.parse().ok()?;
    let alive = icmp_up(addr).await || tcp_up(addr, ws_port).await;
    if !alive {
        return None;
    }
    if let Some(probe) = whoami(ip.clone(), ws_port, &client, &secret).await {
        return Some(probe);
    }

    // Ligada, mas sem Toolkit (ou segredo diferente): SMB, senão só o IP.
    let fallback = Probe {
        ip: ip.clone(),
        hostname: String::new(),
        has_toolkit: false,
        username: String::new(),
        uptime_secs: None,
    };
    Some(identify_without_toolkit(ip, addr).await.unwrap_or(fallback))
}

/// Sonda de VLAN remota: entre VLANs/estados ping e portas costumam ser
/// filtrados, então vai direto ao `/whoami` e, sem resposta, ao plano B por
/// SMB. `None` = nem Toolkit nem SMB responderam.
pub async fn probe_remote(
    ip: Ipv4Addr,
    ws_port: u16,
    client: &reqwest::Client,
    secret: &str,
) -> Option<Probe> {
    match whoami(ip.to_string(), ws_port, client, secret).await {
        Some(probe) => Some(probe),
        None => identify_without_toolkit(ip.to_string(), ip).await,
    }
}

/// Pergunta `/whoami` direto, sem checar presença antes. `None` = não roda o
/// Toolkit (ou porta do chat bloqueada, ou desligado).
pub async fn whoami(
    ip: String,
    ws_port: u16,
    client: &reqwest::Client,
    secret: &str,
) -> Option<Probe> {
    // Enriquecimento: só máquinas com o Toolkit respondem `/whoami`.
    // H2: GET assinado (corpo vazio) — o segredo não trafega, só a assinatura.
    let url = format!("http://{}:{}/whoami", ip, ws_port);
    let signed = net_auth::sign_now(secret, net_auth::OP_WHOAMI, &[]);
    let whoami = client
        .get(&url)
        .header(net_auth::TS_HEADER, signed.ts)
        .header(net_auth::NONCE_HEADER, signed.nonce)
        .header(net_auth::SIG_HEADER, signed.sig)
        .send()
        .await
        .ok();

    if let Some(resp) = whoami {
        if let Ok(body) = resp.json::<serde_json::Value>().await {
            if body.get("ok").and_then(|v| v.as_bool()) == Some(true) {
                let text = |k: &str| {
                    body.get(k)
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string()
                };
                return Some(Probe {
                    ip,
                    hostname: text("hostname"),
                    has_toolkit: true,
                    username: body
                        .get("username")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    uptime_secs: body.get("uptime_secs").and_then(|v| v.as_u64()),
                });
            }
        }
    }
    None
}

/// Sonda uma lista de IPs em paralelo (usado pela busca no histórico).
pub async fn probe_many(ips: Vec<String>, ws_port: u16) -> ApiResult<Vec<Probe>> {
    let client = build_client()?;
    let secret = shared_secret();
    let mut set = JoinSet::new();
    for ip in ips {
        let client = client.clone();
        let secret = secret.clone();
        set.spawn(async move { probe_host(ip, ws_port, client, secret).await });
    }
    let mut probes = Vec::new();
    while let Some(res) = set.join_next().await {
        if let Ok(Some(probe)) = res {
            probes.push(probe);
        }
    }
    Ok(probes)
}

/// Varre os alvos do plano (`networks::build_scan_plan`), no máximo
/// `MAX_CONCURRENT_PROBES` ao mesmo tempo, emitindo `event` com `{done,total}`
/// conforme cada host termina. Devolve (hosts sondados, respostas).
pub async fn scan_targets(
    targets: Vec<ScanTarget>,
    ws_port: u16,
    app: &AppHandle,
    event: &str,
) -> ApiResult<(u16, Vec<Probe>)> {
    let client = build_client()?;
    let secret = shared_secret();
    let limit = Arc::new(Semaphore::new(MAX_CONCURRENT_PROBES));
    // O plano é limitado (VLAN local ≤ /22 + MAX_EXTRA_HOSTS), cabe em u16.
    let probed = u16::try_from(targets.len()).unwrap_or(u16::MAX);

    let mut set = JoinSet::new();
    for target in targets {
        let client = client.clone();
        let secret = secret.clone();
        let limit = Arc::clone(&limit);

        set.spawn(async move {
            // Semáforo fechado nunca acontece (não chamamos close); sem permit = pula.
            let _permit = limit.acquire_owned().await.ok()?;
            if target.remote {
                probe_remote(target.ip, ws_port, &client, &secret).await
            } else {
                probe_host(target.ip.to_string(), ws_port, client, secret).await
            }
        });
    }

    // Coleta as respostas, emitindo progresso conforme cada host termina.
    let total = probed;
    let mut done: u16 = 0;
    let mut probes = Vec::new();
    while let Some(res) = set.join_next().await {
        done += 1;
        if done.is_multiple_of(8) || done == total {
            let _ = app.emit(event, ScanProgress { done, total });
        }
        if let Ok(Some(probe)) = res {
            probes.push(probe);
        }
    }

    Ok((probed, probes))
}
