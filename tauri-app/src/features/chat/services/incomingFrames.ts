/**
 * Parser puro dos frames recebidos do relay → união discriminada.
 * Não aplica regras de papel (role) nem de eco: isso é decisão do hook.
 */

type Presence = 'active' | 'away' | 'offline'

interface FrameBase {
  /** msg_id do frame (usado para descartar o eco das minhas mensagens pendentes). */
  msgId: string | null
}

export type IncomingFrame = FrameBase & (
  | { kind: 'identity'; role: string | null; displayName: string }
  | { kind: 'presence'; role: string | null; presence: Presence | null }
  | { kind: 'session_end'; role: string | null }
  | { kind: 'receipt'; state: 'delivered' | 'read'; ids: string[] }
  | { kind: 'typing'; role: string | null; isStart: boolean }
  | { kind: 'text'; timestamp: number; content: string; raw: Record<string, unknown> }
  | {
      kind: 'file'
      timestamp: number
      filename: string
      mime_type: string
      file_data: string
      raw: Record<string, unknown>
    }
  | { kind: 'unknown' }
)

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)

function receiptIds(json: Record<string, unknown>): string[] {
  if (Array.isArray(json.msg_ids)) {
    return json.msg_ids.filter((id): id is string => typeof id === 'string')
  }
  return typeof json.msg_id === 'string' ? [json.msg_id] : []
}

/** Retorna null quando o payload não é um objeto JSON. */
export function parseIncoming(payload: string): IncomingFrame | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const json = parsed as Record<string, unknown>

  const msgId = strOrNull(json.msg_id)
  const role = strOrNull(json.role)
  const timestamp = typeof json.timestamp === 'number' ? json.timestamp : 0

  switch (json.msg_type) {
    case 'client_identity':
      return { kind: 'identity', msgId, role, displayName: str(json.display_name).trim() }
    case 'presence': {
      const p = json.presence
      const presence = p === 'active' || p === 'away' || p === 'offline' ? p : null
      return { kind: 'presence', msgId, role, presence }
    }
    case 'session_end':
      return { kind: 'session_end', msgId, role }
    case 'receipt': {
      const state = json.state
      const ids = receiptIds(json)
      if ((state === 'delivered' || state === 'read') && ids.length > 0) {
        return { kind: 'receipt', msgId, state, ids }
      }
      return { kind: 'unknown', msgId }
    }
    case 'typing':
      return { kind: 'typing', msgId, role, isStart: json.state === 'start' }
    case 'text':
      return { kind: 'text', msgId, timestamp, content: str(json.content), raw: json }
    case 'file':
      return {
        kind: 'file',
        msgId,
        timestamp,
        filename: str(json.filename),
        mime_type: str(json.mime_type),
        file_data: str(json.file_data),
        raw: json,
      }
    default:
      return { kind: 'unknown', msgId }
  }
}
