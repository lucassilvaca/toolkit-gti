import { WS_STATUS_RANK } from '../../../shared/types/chat'
import type { WsChatMessage, WsMessageStatus } from '../../../shared/types/chat'

/**
 * Troca o status da mensagem `id`. Com `onlyFrom`, só troca se o status atual
 * for exatamente esse (ex.: resolver 'sending' sem sobrescrever um recibo).
 */
export function setMessageStatus(
  list: WsChatMessage[],
  id: string,
  status: WsMessageStatus,
  onlyFrom?: WsMessageStatus,
): WsChatMessage[] {
  return list.map((m) =>
    m.id === id && (onlyFrom === undefined || m.status === onlyFrom) ? { ...m, status } : m,
  )
}

/** Aplica um recibo às MINHAS mensagens, sem nunca regredir o status. */
export function applyReceipt(
  list: WsChatMessage[],
  ids: string[],
  state: 'delivered' | 'read',
): WsChatMessage[] {
  return list.map((m) => {
    if (m.sender !== 'me' || !ids.includes(m.id)) return m
    const current = m.status ?? 'sent'
    return WS_STATUS_RANK[state] > WS_STATUS_RANK[current] ? { ...m, status: state } : m
  })
}
