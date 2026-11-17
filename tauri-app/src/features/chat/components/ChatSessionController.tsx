import { useEffect } from "react";
import { ChatView } from "../views/ChatView";
import { usePersistentChatSession } from "../hooks/usePersistentChatSession";
import type { ChatSessionSummary, ChatSessionTarget } from "../hooks/useChatSessions";

interface Props {
  roomId: string;
  wsUrl: string;
  /** Rótulo inicial (host chamado) até o usuário anunciar seu login Windows. */
  label?: string;
  target?: ChatSessionTarget;
  /** Esta é a conversa visível (aba chat aberta E sala selecionada)? */
  isActive: boolean;
  /** O gerenciador marcou esta sala para encerrar (X da aba ou botão interno). */
  isClosing: boolean;
  onSummary: (roomId: string, summary: ChatSessionSummary) => void;
  /** Dispara o encerramento gracioso desta sala (marca como "encerrando"). */
  onRequestClose: (roomId: string) => void;
  /** Remoção definitiva da sala da lista (após o session_end ser enviado). */
  onClose: (roomId: string) => void;
}

/**
 * Encapsula UMA conversa do técnico. O hook de sessão (socket, histórico,
 * presença, notificações) permanece vivo enquanto o componente estiver montado
 * — inclusive quando a conversa não é a visível — para que mensagens de fundo
 * incrementem o badge e disparem notificação. A `ChatView` só é renderizada
 * para a sessão ativa; as demais retornam `null` mas seguem conectadas.
 */
export function ChatSessionController({
  roomId,
  wsUrl,
  label,
  target,
  isActive,
  isClosing,
  onSummary,
  onRequestClose,
  onClose,
}: Props) {
  const session = usePersistentChatSession();
  const { startSession, markChatTabActive, endSession, clearSession } = session;

  // Inicia (uma vez por sala) a sessão desta conversa.
  useEffect(() => {
    startSession({ roomId, wsUrl });
  }, [roomId, wsUrl, startSession]);

  // Presença/leitura: só a conversa visível fica "ativa"; as de fundo, "away".
  useEffect(() => {
    markChatTabActive(isActive);
  }, [isActive, markChatTabActive]);

  // Encerramento gracioso: ao ser marcada como "encerrando", envia o frame
  // session_end (a janela do usuário mostra "atendimento encerrado" e fecha
  // limpa) e só então remove a aba. Funciona mesmo com a conversa em segundo
  // plano — o socket segue vivo enquanto o componente está montado.
  useEffect(() => {
    if (!isClosing) return;
    endSession();
    const timer = setTimeout(() => {
      clearSession();
      onClose(roomId);
    }, 350);
    return () => clearTimeout(timer);
  }, [isClosing, endSession, clearSession, onClose, roomId]);

  // Reporta o resumo ao gerenciador (barra de abas + badge agregado).
  const { unreadCount, remotePresence, remoteClientDisplayName, status } = session;
  useEffect(() => {
    onSummary(roomId, {
      unreadCount,
      remotePresence,
      // Enquanto o usuário não anuncia o login Windows, usa o rótulo (host chamado).
      displayName: remoteClientDisplayName.trim() || label || "",
      status,
    });
  }, [roomId, unreadCount, remotePresence, remoteClientDisplayName, label, status, onSummary]);

  // Socket segue vivo mesmo sem UI: só não desenhamos a conversa de fundo.
  if (!isActive) return null;

  const remoteName = remoteClientDisplayName.trim() || label || "Sem usuário";

  return (
    <ChatView
      messages={session.messages}
      status={session.status}
      remotePresence={session.remotePresence}
      remoteUserInfo={{ name: remoteName, role: "user" }}
      onSendText={session.sendText}
      onSendFile={session.sendFile}
      onDeleteMessage={session.deleteMessage}
      onRetry={session.retryMessage}
      onTyping={session.notifyTyping}
      remoteTyping={session.remoteTyping}
      // Mesmo caminho do X da aba: pede o encerramento gracioso (session_end).
      onEndSession={() => onRequestClose(roomId)}
      lastError={session.lastError}
      onClearError={session.clearError}
      isLoadingHistory={session.isLoadingHistory}
      notificationPermission={session.notificationPermission}
      onRequestNotificationPermission={session.requestNotificationPermission}
      onMarkMessagesAsRead={session.markMessagesAsRead}
      attendedUserInfo={{ name: remoteName, role: "Conta Windows" }}
      sessionTarget={target}
    />
  );
}
