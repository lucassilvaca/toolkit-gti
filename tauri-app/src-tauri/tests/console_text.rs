//! Decodificação da saída de console (ver `src/infra/console_text.rs`).
//! Bytes reais medidos num Windows PT-BR em 2026-10-18.

#[path = "../src/infra/console_text.rs"]
mod console_text;

use console_text::{decode, for_each_line};

fn lines_of(bytes: &[u8]) -> Vec<String> {
    let mut out = Vec::new();
    for_each_line(bytes, |line| {
        out.push(line);
        true
    });
    out
}

#[test]
fn oem_850_accent_does_not_stop_streaming() {
    // "Atualizando a pol\xA1tica..." (gpupdate/ping em OEM 850) + linha seguinte.
    let bytes = b"Atualizando a pol\xA1tica...\r\n\r\nConclu\xA1do.\r\n";
    assert_eq!(
        lines_of(bytes),
        vec!["Atualizando a política...", "Concluído."]
    );
}

#[test]
fn utf16le_sfc_output_is_decoded_and_split() {
    let text =
        "Iniciando verificação.\r\nVerificação 10% concluída.\rVerificação 100% concluída.\r\n";
    let bytes: Vec<u8> = text.encode_utf16().flat_map(u16::to_le_bytes).collect();
    assert_eq!(
        lines_of(&bytes),
        vec![
            "Iniciando verificação.",
            "Verificação 10% concluída.",
            "Verificação 100% concluída."
        ]
    );
}

#[test]
fn valid_utf8_is_kept() {
    assert_eq!(
        decode("Estatísticas do Ping".as_bytes()),
        "Estatísticas do Ping"
    );
}

#[test]
fn whole_output_in_oem_is_decoded() {
    assert_eq!(decode(b"Configura\x87\xC6o de IP"), "Configuração de IP");
}

#[test]
fn stops_when_callback_returns_false() {
    let mut seen = 0;
    for_each_line(&b"a\nb\nc\n"[..], |_| {
        seen += 1;
        seen < 2
    });
    assert_eq!(seen, 2);
}

#[test]
fn last_line_without_newline_is_flushed() {
    assert_eq!(lines_of(b"linha 1\nlinha 2"), vec!["linha 1", "linha 2"]);
}
