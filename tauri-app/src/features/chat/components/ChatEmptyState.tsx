import { MessageSquare } from "lucide-react";
import type { WsPresenceState } from "../../../shared/types/chat";

interface ChatEmptyStateProps {
  connected: boolean;
  remotePresence: WsPresenceState;
}

/** Estado vazio do chat do técnico (sem mensagens). */
export function ChatEmptyState({ connected, remotePresence }: ChatEmptyStateProps) {
  return (
    <div className="flex h-full select-none flex-col items-center justify-center gap-4 py-16">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-raised">
        <MessageSquare size={20} className="text-accent-soft" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-ink">
          {connected ? "Sessão ativa" : "Aguardando conexão..."}
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          {connected
            ? "Envie uma mensagem ou arquivo para iniciar"
            : remotePresence === "offline"
            ? "Usuário offline ou atendimento encerrado"
            : "O usuário ainda não entrou na sala"}
        </p>
      </div>
    </div>
  );
}
