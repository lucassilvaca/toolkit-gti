//! Decodificação da saída de programas de console do Windows.
//!
//! Medido em 2026-10-18 (Windows PT-BR, processo sem console: `CREATE_NO_WINDOW`):
//! - ping, ipconfig, netstat, nslookup, DISM → página OEM (850): `í` = 0xA1;
//! - gpupdate → OEM, ou ANSI (1252) quando prefixado com `chcp 65001`;
//! - sfc → UTF-16LE.
//!
//! Sem console, `chcp 65001` não força UTF-8 — e `BufRead::lines()` aborta na
//! primeira linha acentuada (`InvalidData`), o que fazia o terminal do app
//! ficar sem saída. Por isso todo stdout/stderr de comando passa por aqui.
//!
//! Módulo PURO (só `std` + `windows`) para ser incluído via `#[path]` em
//! `tests/console_text.rs` — mesma técnica de `net_guard.rs`.

use std::io::Read;

/// Primeiro par de bytes parece UTF-16LE: BOM `FF FE` ou caractere ASCII + 0x00.
fn looks_utf16le(bytes: &[u8]) -> bool {
    bytes.len() >= 2 && ((bytes[0] == 0xFF && bytes[1] == 0xFE) || (bytes[0] != 0 && bytes[1] == 0))
}

fn utf16le_to_string(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| u16::from_le_bytes(*pair))
        .collect();
    String::from_utf16_lossy(&units)
        .trim_start_matches('\u{FEFF}')
        .to_string()
}

/// Texto em 8 bits: UTF-8 quando válido, senão a página OEM do sistema.
fn narrow_to_string(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => oem_to_string(bytes),
    }
}

#[cfg(windows)]
fn oem_to_string(bytes: &[u8]) -> String {
    use windows::Win32::Globalization::{
        MultiByteToWideChar, CP_OEMCP, MULTI_BYTE_TO_WIDE_CHAR_FLAGS,
    };

    let flags = MULTI_BYTE_TO_WIDE_CHAR_FLAGS(0);
    // SAFETY: `bytes` é um slice válido; com destino `None` a API só calcula o tamanho.
    let needed = unsafe { MultiByteToWideChar(CP_OEMCP, flags, bytes, None) };
    if needed <= 0 {
        return String::from_utf8_lossy(bytes).into_owned();
    }
    let mut wide = vec![0u16; needed as usize];
    // SAFETY: `wide` tem exatamente o tamanho informado pela chamada anterior.
    let written = unsafe { MultiByteToWideChar(CP_OEMCP, flags, bytes, Some(&mut wide)) };
    String::from_utf16_lossy(&wide[..written.max(0) as usize])
}

#[cfg(not(windows))]
fn oem_to_string(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// Decodifica a saída inteira de um comando (UTF-16LE, UTF-8 ou OEM).
pub fn decode(bytes: &[u8]) -> String {
    if looks_utf16le(bytes) {
        utf16le_to_string(bytes)
    } else {
        narrow_to_string(bytes)
    }
}

/// Lê `reader` até o fim e entrega cada linha não vazia, já decodificada e sem
/// espaços nas pontas. `\r` também encerra linha (progresso do SFC/DISM).
/// Para quando `on_line` retorna `false`. Erros de leitura encerram a leitura.
pub fn for_each_line<R: Read>(mut reader: R, mut on_line: impl FnMut(String) -> bool) {
    let mut pending: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 4096];
    let mut utf16: Option<bool> = None;

    // Emite as linhas completas de `pending`; com `flush`, também o resto.
    let mut drain = |pending: &mut Vec<u8>, utf16: bool, flush: bool| -> bool {
        let step = if utf16 { 2 } else { 1 };
        let mut start = 0;
        let mut i = 0;
        while i + step <= pending.len() {
            let is_break = matches!(pending[i], b'\n' | b'\r') && (!utf16 || pending[i + 1] == 0);
            if is_break {
                if !emit(&pending[start..i], utf16, &mut on_line) {
                    return false;
                }
                start = i + step;
            }
            i += step;
        }
        if flush && start < pending.len() && !emit(&pending[start..], utf16, &mut on_line) {
            return false;
        }
        pending.drain(..if flush { pending.len() } else { start });
        true
    };

    loop {
        let read = match reader.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        pending.extend_from_slice(&chunk[..read]);
        if utf16.is_none() && pending.len() >= 2 {
            utf16 = Some(looks_utf16le(&pending));
        }
        if let Some(is_utf16) = utf16 {
            if !drain(&mut pending, is_utf16, false) {
                return;
            }
        }
    }
    drain(&mut pending, utf16.unwrap_or(false), true);
}

fn emit(raw: &[u8], utf16: bool, on_line: &mut impl FnMut(String) -> bool) -> bool {
    let text = if utf16 {
        utf16le_to_string(raw)
    } else {
        narrow_to_string(raw)
    };
    let trimmed = text.trim();
    trimmed.is_empty() || on_line(trimmed.to_string())
}
