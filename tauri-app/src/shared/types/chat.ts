export interface NetworkConfig {
  tcp_port: number;
  last_modified: string;
  applied_at: string;
}

// ============================================
// WebSocket Chat Types (WS migration)
// ============================================

export interface UserInfo {
  name: string
  role: 'tech' | 'user'
  presence: WsPresenceState
  avatar?: string
}

/**
 * Estado de entrega de uma mensagem própria (sender 'me'):
 * sending → sent → delivered → read, ou failed.
 */
export type WsMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

/** Ordem de progressão — usada para nunca "regredir" o status. */
export const WS_STATUS_RANK: Record<WsMessageStatus, number> = {
  failed: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
}

export type WsChatMessage =
  | {
      id: string
      sender: 'me' | 'remote'
      senderInfo?: UserInfo
      status?: WsMessageStatus
      type: 'text'
      content: string
      timestamp: number
    }
  | {
      id: string
      sender: 'me' | 'remote'
      senderInfo?: UserInfo
      status?: WsMessageStatus
      type: 'file'
      filename: string
      mime_type: string
      file_data: string
      timestamp: number
    }

/**
 * WS connection status derived from WS connection state.
 * - 'connecting'   = WS not yet open
 * - 'connected'    = WS open, recent activity
 * - 'idle'         = connected but no message received for >60s
 * - 'disconnected' = WS closed (includes reconnecting with backoff)
 */
export type WsConnectionStatus = 'connecting' | 'connected' | 'idle' | 'disconnected'

export type WsPresenceState = 'unknown' | 'active' | 'away' | 'offline'

export function isWsTextMessage(msg: WsChatMessage): msg is WsChatMessage & { type: 'text' } {
  return msg.type === 'text'
}

export function isWsFileMessage(msg: WsChatMessage): msg is WsChatMessage & { type: 'file' } {
  return msg.type === 'file'
}

// ============================================
// Persistência (formato único em disco)
// ============================================

/**
 * Formato persistido em disco — espelha a struct `ChatMessage` do Rust
 * (`commands/public/chat/storage.rs`), salva em `Documents/Toolkit_GTI/chat_<room>.json`.
 * É a ÚNICA forma de histórico do chat (o sistema "enhanced" nunca existiu no backend).
 */
export interface PersistedChatMessage {
  from: string // "me" | "remote"
  text: string
  timestamp: string // ISO 8601
  kind: string // "text" | "file"
  file_name?: string
  file_data?: string
  file_size?: number
}

/** Converte uma mensagem viva (WS) para o formato persistido. */
export function wsToPersisted(msg: WsChatMessage): PersistedChatMessage {
  if (msg.type === 'file') {
    return {
      from: msg.sender,
      text: `Arquivo: ${msg.filename}`,
      timestamp: new Date(msg.timestamp).toISOString(),
      kind: 'file',
      file_name: msg.filename,
      file_data: msg.file_data,
    }
  }
  return {
    from: msg.sender,
    text: msg.content,
    timestamp: new Date(msg.timestamp).toISOString(),
    kind: 'text',
  }
}

/** Converte uma mensagem persistida de volta para o formato vivo (WS). */
export function persistedToWs(p: PersistedChatMessage, index: number): WsChatMessage {
  const ts = Date.parse(p.timestamp) || 0
  const sender: 'me' | 'remote' = p.from === 'me' ? 'me' : 'remote'
  const id = `hist-${ts}-${index}`
  if (p.kind === 'file') {
    return {
      id,
      sender,
      type: 'file',
      filename: p.file_name ?? p.text,
      mime_type: '',
      file_data: p.file_data ?? '',
      timestamp: ts,
    }
  }
  return { id, sender, type: 'text', content: p.text, timestamp: ts }
}
