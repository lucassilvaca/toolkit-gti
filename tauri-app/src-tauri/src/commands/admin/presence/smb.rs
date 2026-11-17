//! Quem está logado numa máquina via SMB (porta 445), sem o Toolkit nela.
//!
//! Plano B da presença: entre estados/VLANs a 445 costuma passar onde a porta
//! do chat (7890) e a 135 (WMI/DCOM) não passam. `NetWkstaUserEnum` nível 1
//! roda por RPC sobre named pipe (`\pipe\wkssvc`) e exige que o técnico seja
//! admin local no alvo — o que o grupo de técnicos (`TOOLKIT_ADMIN_GROUP`) já garante.
//! Medido na rede interna (2026-10-29): ~70 ms até outro estado, contra 15-21 s
//! (ou falha) do WMI via DCOM.

use super::matching::identify_logons;
use std::time::Duration;

/// Uma sessão devolvida por `NetWkstaUserEnum` nível 1 (`WKSTA_USER_INFO_1`).
#[repr(C)]
struct WkstaUserInfo1 {
    user: *const u16,
    logon_domain: *const u16,
    _oth_domains: *const u16,
    _logon_server: *const u16,
}

#[link(name = "netapi32")]
extern "system" {
    fn NetWkstaUserEnum(
        servername: *const u16,
        level: u32,
        bufptr: *mut *mut u8,
        prefmaxlen: u32,
        entriesread: *mut u32,
        totalentries: *mut u32,
        resumehandle: *mut u32,
    ) -> u32;
    fn NetApiBufferFree(buffer: *mut std::ffi::c_void) -> u32;
}

const NERR_SUCCESS: u32 = 0;
/// Pede à API que aloque tudo de uma vez (sem paginação).
const MAX_PREFERRED_LENGTH: u32 = u32::MAX;
/// Teto por máquina; a porta 445 já foi testada antes, então isto só corta
/// casos patológicos (RPC travado do outro lado).
const SMB_TIMEOUT: Duration = Duration::from_secs(5);

/// Lê uma string UTF-16 terminada em 0.
///
/// SAFETY (do chamador): `ptr` é nulo ou aponta para UTF-16 terminado em 0.
unsafe fn wide_to_string(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
}

/// Sessões abertas em `ip` como `(domínio, usuário)`. `None` se a chamada
/// falhar (sem acesso, SMB indisponível, host inexistente). Bloqueante.
fn enum_logons_blocking(ip: &str) -> Option<Vec<(String, String)>> {
    let server: Vec<u16> = ip.encode_utf16().chain(std::iter::once(0)).collect();
    let mut buf: *mut u8 = std::ptr::null_mut();
    let (mut read, mut total, mut resume) = (0u32, 0u32, 0u32);

    // SAFETY: `server` termina em 0 e vive até o fim da chamada; os ponteiros
    // de saída apontam para variáveis locais válidas.
    let status = unsafe {
        NetWkstaUserEnum(
            server.as_ptr(),
            1,
            &mut buf,
            MAX_PREFERRED_LENGTH,
            &mut read,
            &mut total,
            &mut resume,
        )
    };

    let mut out = Vec::new();
    if status == NERR_SUCCESS && !buf.is_null() {
        let entries = buf as *const WkstaUserInfo1;
        for i in 0..read as usize {
            // SAFETY: a API devolveu `read` structs contíguas em `buf`, com
            // strings UTF-16 terminadas em 0 (ou nulas).
            let entry = unsafe { &*entries.add(i) };
            let domain = unsafe { wide_to_string(entry.logon_domain) };
            let user = unsafe { wide_to_string(entry.user) };
            out.push((domain, user));
        }
    }
    if !buf.is_null() {
        // SAFETY: `buf` foi alocado pela própria API e é liberado uma vez.
        unsafe {
            NetApiBufferFree(buf.cast());
        }
    }
    (status == NERR_SUCCESS).then_some(out)
}

/// `(hostname, usuário)` de `ip` via SMB, com tempo limite. Campos vazios
/// quando a máquina responde mas não há sessão de pessoa; `None` se a
/// consulta falhou (ex.: sem permissão de admin no alvo).
pub async fn identify_via_smb(ip: &str) -> Option<(String, String)> {
    let ip = ip.to_string();
    let task = tokio::task::spawn_blocking(move || enum_logons_blocking(&ip));
    let entries = tokio::time::timeout(SMB_TIMEOUT, task).await.ok()?.ok()??;
    Some(identify_logons(&entries))
}
