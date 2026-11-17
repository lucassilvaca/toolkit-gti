import { X } from "lucide-react";
import type { WsPresenceState } from "../../../shared/types/chat";
import type { ChatSessionRef, ChatSessionSummary } from "../hooks/useChatSessions";

interface Props {
  sessions: ChatSessionRef[];
  activeRoomId: string | null;
  /** Salas em encerramento — a aba fica esmaecida e sem ação até sair. */
  closingRoomIds: string[];
  getSummary: (roomId: string) => ChatSessionSummary;
  onSelect: (roomId: string) => void;
  /** Encerramento gracioso (envia session_end antes de remover). */
  onRequestClose: (roomId: string) => void;
}

const PRESENCE_DOT: Record<WsPresenceState, string> = {
  active: "bg-success",
  away: "bg-warning",
  offline: "bg-danger",
  unknown: "bg-ink-faint",
};

/** Seletor de conversas ativas do técnico (uma aba por atendimento). */
export function ChatSessionTabs({
  sessions,
  activeRoomId,
  closingRoomIds,
  getSummary,
  onSelect,
  onRequestClose,
}: Props) {
  if (sessions.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line pb-2">
      {sessions.map((s) => {
        const summary = getSummary(s.roomId);
        const isActive = s.roomId === activeRoomId;
        const isClosing = closingRoomIds.includes(s.roomId);
        const name = isClosing
          ? "Encerrando…"
          : summary.displayName.trim() || "Conectando…";
        return (
          <div
            key={s.roomId}
            className={`group flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
              isClosing
                ? "border-line bg-surface/20 text-ink-faint opacity-60"
                : isActive
                  ? "border-accent/40 bg-accent/10 text-ink-strong"
                  : "border-line bg-surface/30 text-ink-muted hover:text-ink"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(s.roomId)}
              disabled={isClosing}
              className="flex items-center gap-2 disabled:cursor-default"
              title={name}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${PRESENCE_DOT[summary.remotePresence]}`}
              />
              <span className="max-w-[140px] truncate">{name}</span>
              {summary.unreadCount > 0 && !isActive && !isClosing && (
                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                  {summary.unreadCount > 9 ? "9+" : summary.unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onRequestClose(s.roomId)}
              disabled={isClosing}
              className="rounded p-0.5 text-ink-faint opacity-60 transition hover:text-danger group-hover:opacity-100 disabled:opacity-30"
              title="Encerrar atendimento"
              aria-label="Encerrar atendimento"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
