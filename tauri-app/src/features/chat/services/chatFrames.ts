/**
 * Construtores dos frames JSON trocados pelo chat (relay encaminha tudo cru).
 * Centralizar aqui evita divergência de nomes de campo entre os pontos de envio.
 *
 * Convenção de `sender`:
 * - "me"     → mensagens do próprio usuário (text/file)
 * - "system" → frames de controle (presence/identity/receipt/typing)
 */

type Role = "tech" | "user";
type Presence = "active" | "away" | "offline";
type ReceiptState = "delivered" | "read";
type TypingState = "start" | "stop";

export type ChatFrame = Record<string, unknown>;

export function presenceFrame(
  role: Role,
  presence: Presence,
  timestamp: number,
): ChatFrame {
  return { sender: "system", msg_type: "presence", role, presence, timestamp };
}

export function clientIdentityFrame(
  displayName: string,
  timestamp: number,
): ChatFrame {
  return {
    sender: "system",
    msg_type: "client_identity",
    role: "user",
    display_name: displayName,
    timestamp,
  };
}

export function typingFrame(
  role: Role,
  state: TypingState,
  timestamp: number,
): ChatFrame {
  return { sender: "system", msg_type: "typing", role, state, timestamp };
}

/** Encerramento do atendimento — o outro lado deve fechar a conversa. */
export function sessionEndFrame(role: Role, timestamp: number): ChatFrame {
  return { sender: "system", msg_type: "session_end", role, timestamp };
}

/** Recibo de entrega (um id) ou leitura (um ou vários ids). */
export function receiptFrame(
  state: ReceiptState,
  ids: string[],
  timestamp: number,
): ChatFrame {
  const base = { sender: "system", msg_type: "receipt", state, timestamp };
  return ids.length === 1
    ? { ...base, msg_id: ids[0] }
    : { ...base, msg_ids: ids };
}

export function textFrame(
  content: string,
  timestamp: number,
  msgId: string,
): ChatFrame {
  return { sender: "me", msg_type: "text", content, timestamp, msg_id: msgId };
}

export function fileFrame(
  filename: string,
  mimeType: string,
  fileData: string,
  timestamp: number,
  msgId: string,
): ChatFrame {
  return {
    sender: "me",
    msg_type: "file",
    filename,
    mime_type: mimeType,
    file_data: fileData,
    timestamp,
    msg_id: msgId,
  };
}
