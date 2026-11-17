import type { WsChatMessage } from "../../../shared/types/chat";
import { isSameDay, formatDateSeparator } from "../../../shared/utils/datetime";

/**
 * Item renderizável na lista do chat: ou uma mensagem, ou um separador de
 * data, ou o divisor de "novas mensagens". Permite que as duas janelas
 * (técnico e usuário) compartilhem a mesma lógica de agrupamento.
 */
export type TimelineItem =
  | { kind: "date"; key: string; label: string }
  | { kind: "unread"; key: string }
  | { kind: "message"; key: string; msg: WsChatMessage };

/** Timestamps válidos só quando > 0 (persistedToWs usa 0 como fallback). */
function hasValidTime(ts: number): boolean {
  return Number.isFinite(ts) && ts > 0;
}

/**
 * Monta a lista renderizável a partir das mensagens já ordenadas por tempo.
 * Insere um separador de data sempre que o dia muda e o divisor de não-lidas
 * imediatamente antes de `unreadBeforeId` (quando informado).
 */
export function buildChatTimeline(
  messages: WsChatMessage[],
  unreadBeforeId: string | null,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  let prevTs: number | null = null;

  for (const msg of messages) {
    if (
      hasValidTime(msg.timestamp) &&
      (prevTs === null || !isSameDay(prevTs, msg.timestamp))
    ) {
      items.push({
        kind: "date",
        key: `date-${msg.id}`,
        label: formatDateSeparator(msg.timestamp),
      });
      prevTs = msg.timestamp;
    } else if (prevTs === null && hasValidTime(msg.timestamp)) {
      prevTs = msg.timestamp;
    }

    if (unreadBeforeId && msg.id === unreadBeforeId) {
      items.push({ kind: "unread", key: `unread-${msg.id}` });
    }

    items.push({ kind: "message", key: msg.id, msg });
  }

  return items;
}
