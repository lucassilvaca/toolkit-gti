//! Centralized logging macros and diagnostic helpers.
//!
//! Replaces duplicated macro definitions previously in lib.rs, chat.rs, and popup.rs.
//! Macros use `file!()` and `line!()` which expand at the call site, so log output
//! correctly identifies the caller's location.

//! Além do stderr (só visível em `tauri dev`), cada linha vai para
//! `%LOCALAPPDATA%\ToolkitGTI\logs\toolkit.log` — é o que permite
//! investigar uma falha numa estação de produção. Rotação simples: passou de
//! 5 MB, vira `toolkit.log.1` (só uma geração). Em release o nível DEBUG não
//! vai para o arquivo: ele carrega conteúdo de mensagens e respostas.

#[cfg(windows)]
use crate::infra::windows::CREATE_NO_WINDOW;
use std::any::Any;
use std::backtrace::Backtrace;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, PoisonError, TryLockError};

/// Base diagnostic logging macro with file and line info.
macro_rules! log_diag {
    ($level:expr, $($arg:tt)*) => {
        $crate::logging::write_log(
            $level,
            &format!("[{} {}:{}] {}", $level, file!(), line!(), format!($($arg)*)),
        )
    };
}

const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;

struct LogFile {
    file: File,
    written: u64,
}

static LOG_FILE: Mutex<Option<LogFile>> = Mutex::new(None);

/// `%LOCALAPPDATA%\ToolkitGTI\logs\toolkit.log` (mesma pasta-base do
/// `rate_limit.json`).
pub fn log_file_path() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|base| {
        PathBuf::from(base)
            .join("ToolkitGTI")
            .join("logs")
            .join("toolkit.log")
    })
}

/// Abre o log em modo append, girando antes se já passou do limite.
fn open_log() -> Option<LogFile> {
    let path = log_file_path()?;
    std::fs::create_dir_all(path.parent()?).ok()?;
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if size > MAX_LOG_BYTES {
        let _ = std::fs::rename(&path, path.with_extension("log.1"));
    }
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .ok()?;
    let written = file.metadata().map(|m| m.len()).unwrap_or(0);
    Some(LogFile { file, written })
}

/// Escreve uma linha no stderr e no arquivo de log. Falha ao gravar o
/// arquivo nunca derruba o app (o log é diagnóstico, não dado).
pub fn write_log(level: &str, line: &str) {
    eprintln!("{line}");
    if level == "DEBUG" && !cfg!(debug_assertions) {
        return;
    }
    // Mutex envenenado (panic com o log aberto) não pode calar o log para sempre.
    let mut guard = LOG_FILE.lock().unwrap_or_else(PoisonError::into_inner);
    append_line(&mut guard, line);
}

fn append_line(slot: &mut Option<LogFile>, line: &str) {
    if slot.is_none() {
        *slot = open_log();
    }
    let Some(log) = slot.as_mut() else {
        return;
    };
    let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    if writeln!(log.file, "{stamp} {line}").is_ok() {
        log.written += line.len() as u64 + 26;
    }
    if log.written > MAX_LOG_BYTES {
        // Reabrir faz a rotação (open_log vê o tamanho e renomeia).
        *slot = None;
        *slot = open_log();
    }
}

/// Grava uma linha de falha fatal sem nunca bloquear: o próprio thread que
/// falhou pode estar dentro de `write_log` segurando o mutex.
fn write_fatal(line: &str) {
    eprintln!("{line}");
    match LOG_FILE.try_lock() {
        Ok(mut guard) => append_line(&mut guard, line),
        Err(TryLockError::Poisoned(poisoned)) => append_line(&mut poisoned.into_inner(), line),
        Err(TryLockError::WouldBlock) => append_line(&mut None, line),
    }
}

/// Texto de um panic (`panic!("...")` gera `&str` ou `String`).
fn panic_message(payload: &(dyn Any + Send)) -> String {
    payload
        .downcast_ref::<&str>()
        .map(|s| (*s).to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "<panic sem mensagem>".to_string())
}

/// Grava no `toolkit.log` todo panic (thread, local e backtrace) antes do
/// comportamento padrão. Sem isso, em release (sem console) o app fechava sem
/// deixar rastro. Panics em tasks do tokio não derrubam o app, mas também ficam
/// registrados — costumam explicar uma função que "parou de responder".
pub fn install_crash_logging() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "?".to_string());
        write_fatal(&format!(
            "[FATAL] panic na thread '{}' em {}: {}\n{}",
            thread.name().unwrap_or("<sem nome>"),
            location,
            panic_message(info.payload()),
            Backtrace::force_capture()
        ));
        default_hook(info);
    }));

    #[cfg(windows)]
    install_unhandled_exception_logging();
}

/// Falhas nativas (violação de acesso em FFI, stack overflow) não passam pelo
/// hook de panic: o Windows encerra o processo direto. O filtro grava o código
/// da exceção e o endereço antes do encerramento padrão.
#[cfg(windows)]
fn install_unhandled_exception_logging() {
    use windows::Win32::System::Diagnostics::Debug::{
        SetUnhandledExceptionFilter, EXCEPTION_POINTERS,
    };

    /// Deixa o Windows seguir com o encerramento (e o relatório de erro).
    const EXCEPTION_CONTINUE_SEARCH: i32 = 0;

    unsafe extern "system" fn on_unhandled(info: *const EXCEPTION_POINTERS) -> i32 {
        // SAFETY: o Windows passa ponteiros válidos durante o filtro; mesmo
        // assim tudo é checado contra nulo.
        let record = unsafe { info.as_ref().and_then(|p| p.ExceptionRecord.as_ref()) };
        let line = match record {
            Some(r) => format!(
                "[FATAL] exceção nativa não tratada 0x{:08X} no endereço {:?}",
                r.ExceptionCode.0, r.ExceptionAddress
            ),
            None => "[FATAL] exceção nativa não tratada (sem detalhes)".to_string(),
        };
        write_fatal(&line);
        EXCEPTION_CONTINUE_SEARCH
    }

    // SAFETY: registra um callback `extern "system"` com a assinatura exigida.
    unsafe {
        SetUnhandledExceptionFilter(Some(on_unhandled));
    }
}

macro_rules! log_debug {
    ($($arg:tt)*) => { log_diag!("DEBUG", $($arg)*) };
}

macro_rules! log_info {
    ($($arg:tt)*) => { log_diag!("INFO", $($arg)*) };
}

macro_rules! log_error {
    ($($arg:tt)*) => { log_diag!("ERROR", $($arg)*) };
}

macro_rules! log_warn {
    ($($arg:tt)*) => { log_diag!("WARN", $($arg)*) };
}

/// Check if an IO error is OS Error 5 (Access Denied)
pub fn is_access_denied(e: &std::io::Error) -> bool {
    let code = e.raw_os_error();
    let result = code == Some(5);
    if result {
        log_error!("*** OS ERROR 5 DETECTED ***");
    }
    result
}

#[allow(dead_code)]
/// Get human-readable message for OS Error 5
pub fn access_denied_message(operation: &str) -> String {
    format!(
        "Acesso negado ao {}. O aplicativo precisa ser executado como Administrador para esta operação.",
        operation
    )
}

#[allow(dead_code)]
/// Get detailed error message including OS error code
pub fn detailed_error_message(context: &str, error: &std::io::Error) -> String {
    if let Some(code) = error.raw_os_error() {
        format!("{}: {} (OS Error {})", context, error, code)
    } else {
        format!("{}: {}", context, error)
    }
}

#[allow(dead_code)]
/// Windows-specific: Check if current process has admin privileges
#[cfg(windows)]
pub fn is_elevated() -> bool {
    use std::os::windows::process::CommandExt;

    std::process::Command::new("net")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["session"])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(not(windows))]
pub fn is_elevated() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::panic_message;

    #[test]
    fn mensagem_de_panic_str_e_string() {
        let estatico: Box<dyn std::any::Any + Send> = Box::new("falhou");
        assert_eq!(panic_message(estatico.as_ref()), "falhou");

        let formatado: Box<dyn std::any::Any + Send> = Box::new(format!("porta {}", 7890));
        assert_eq!(panic_message(formatado.as_ref()), "porta 7890");

        let outro: Box<dyn std::any::Any + Send> = Box::new(42_u32);
        assert_eq!(panic_message(outro.as_ref()), "<panic sem mensagem>");
    }
}
