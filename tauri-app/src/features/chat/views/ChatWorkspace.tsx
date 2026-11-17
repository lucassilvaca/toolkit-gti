import { MessageSquare } from "lucide-react";
import { ChatSessionTabs } from "../components/ChatSessionTabs";
import { ChatSessionController } from "../components/ChatSessionController";
import type { ChatSessionsManager } from "../hooks/useChatSessions";

interface Props {
  manager: ChatSessionsManager;
}

/**
 * Área de chat do técnico com múltiplos atendimentos simultâneos: uma barra de
 * abas no topo e, abaixo, a conversa selecionada. Todas as sessões abertas
 * ficam montadas (sockets vivos) — apenas a ativa é desenhada.
 */
export function ChatWorkspace({ manager }: Props) {
  const {
    sessions,
    activeRoomId,
    isChatTabOpen,
    closingRoomIds,
    getSummary,
    setActive,
    requestClose,
    closeSession,
    reportSummary,
  } = manager;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ChatSessionTabs
        sessions={sessions}
        activeRoomId={activeRoomId}
        closingRoomIds={closingRoomIds}
        getSummary={getSummary}
        onSelect={setActive}
        onRequestClose={requestClose}
      />

      <div className="relative min-h-0 flex-1">
        {sessions.length === 0 ? (
          <div className="flex h-full select-none flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-raised">
              <MessageSquare size={20} className="text-accent-soft" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Nenhum atendimento ativo</p>
              <p className="mt-1 text-xs text-ink-faint">
                Inicie um chat pela aba Chamados ou Usuários Online para atender um usuário.
              </p>
            </div>
          </div>
        ) : (
          sessions.map((s) => (
            <ChatSessionController
              key={s.roomId}
              roomId={s.roomId}
              wsUrl={s.wsUrl}
              label={s.label}
              target={s.target}
              isActive={isChatTabOpen && s.roomId === activeRoomId}
              isClosing={closingRoomIds.includes(s.roomId)}
              onSummary={reportSummary}
              onRequestClose={requestClose}
              onClose={closeSession}
            />
          ))
        )}
      </div>
    </div>
  );
}
