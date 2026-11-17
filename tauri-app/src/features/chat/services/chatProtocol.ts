import { MAX_FILE_SIZE } from "../../../shared/constants/chat";
import type { WsChatMessage } from "../../../shared/types/chat";

// ── Constantes de conexão ────────────────────────────────────────────────────

/** Backoff exponencial (ms) entre tentativas de reconexão. */
export const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

/** Limite de frame/mensagem do socket nativo (14MB para caber arquivos de 10MB em base64). */
export const MAX_MESSAGE_BYTES = 14 * 1024 * 1024;

/** Tentativas para códigos transitórios (4003 sala cheia / 4404 sala sumiu). */
export const ROOM_GONE_MAX_RETRIES = 8;

/** Sem nenhum tráfego nessa janela = conexão morta (TCP half-open). */
export const WATCHDOG_TIMEOUT_MS = 35_000;

// ── Tipos do socket nativo (plugin Tauri) ────────────────────────────────────

export interface NativeSocketMessage {
  type: "Text" | "Binary" | "Ping" | "Pong" | "Close";
  data: string | number[] | { code: number; reason: string } | null;
}

export interface NativeSocket {
  addListener(cb: (arg: NativeSocketMessage) => void): () => void;
  send(message: string): Promise<void>;
  disconnect(): Promise<void>;
}

// ── Helpers puros ────────────────────────────────────────────────────────────

/** Em ambiente Tauri usamos o socket nativo; no navegador, o WebSocket padrão. */
export function shouldUseNativeSocket(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

/**
 * Detecta se um frame recebido é o eco da própria mensagem (relay reenvia tudo).
 * Compara por sender 'me' + tipo + timestamp + conteúdo.
 */
export function isLikelyEcho(
  json: Record<string, unknown>,
  messages: WsChatMessage[],
  timestamp: number,
): boolean {
  if (json.sender !== "me") return false;

  const msgType = json.msg_type;
  if (msgType === "text") {
    const content = typeof json.content === "string" ? json.content : "";
    return messages.some(
      (message) =>
        message.sender === "me" &&
        message.type === "text" &&
        message.timestamp === timestamp &&
        message.content === content,
    );
  }

  if (msgType === "file") {
    const filename = typeof json.filename === "string" ? json.filename : "";
    const mimeType = typeof json.mime_type === "string" ? json.mime_type : "";
    const fileData = typeof json.file_data === "string" ? json.file_data : "";
    return messages.some(
      (message) =>
        message.sender === "me" &&
        message.type === "file" &&
        message.timestamp === timestamp &&
        message.filename === filename &&
        message.mime_type === mimeType &&
        message.file_data === fileData,
    );
  }

  return false;
}

/** Extensões bloqueadas no envio de arquivos. */
const DANGEROUS_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".scr",
  ".vbs",
  ".js",
  ".jar",
];

export type FileValidation = { ok: true } | { ok: false; error: string };

/**
 * Valida um arquivo de saída: tamanho (a partir do base64), nome e extensão.
 * Mensagens em pt-BR prontas para exibição.
 */
export function validateOutgoingFile(
  filename: string,
  fileDataBase64: string,
): FileValidation {
  const binarySize = Math.floor(fileDataBase64.length * 0.75);
  if (binarySize > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `Arquivo muito grande (${Math.round(
        binarySize / 1024 / 1024,
      )}MB). Máximo permitido: 10MB`,
    };
  }

  if (!filename || filename.trim().length === 0) {
    return { ok: false, error: "Nome do arquivo inválido" };
  }

  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return { ok: false, error: `Tipo de arquivo não permitido: ${ext}` };
  }

  return { ok: true };
}
