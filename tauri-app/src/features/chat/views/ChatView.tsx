import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DotsLoader, PageShell } from "../../../shared/components";
import { ACCEPTED_FILE_TYPES } from "../../../shared/constants/chat";
import { ChatMessage } from "../components/ChatMessage";
import { ChatComposer } from "../components/ChatComposer";
import { ChatEmptyState } from "../components/ChatEmptyState";
import { ChatTimeline } from "../components/ChatTimeline";
import { TechnicianHeader } from "../components/TechnicianHeader";
import { TechnicianSessionPanel } from "../components/TechnicianSessionPanel";
import { NotificationPermissionBanner } from "../components/NotificationPermissionBanner";
import { buildChatTimeline } from "../utils/timeline";
import { useChatAutoScroll } from "../hooks/useChatAutoScroll";
import { useUnreadDivider } from "../hooks/useUnreadDivider";
import { useWindowFocus } from "../hooks/useWindowFocus";
import { useFileAttachment, useSaveReceivedFile, type FileAlert } from "../hooks/useChatFiles";
import type {
  WsChatMessage,
  WsConnectionStatus,
  WsPresenceState,
} from "../../../shared/types/chat";
import type { ChatSessionTarget } from "../hooks/useChatSessions";

interface ChatViewProps {
  messages: WsChatMessage[];
  status: WsConnectionStatus;
  remotePresence: WsPresenceState;
  remoteUserInfo?: { name: string; role: 'tech' | 'user' };
  onSendText: (text: string) => void;
  onSendFile: (fileName: string, mimeType: string, fileData: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  /** Reenvia uma mensagem própria que falhou. */
  onRetry?: (messageId: string) => void;
  /** Avisa que o técnico está digitando. */
  onTyping?: () => void;
  /** O usuário remoto está digitando. */
  remoteTyping?: boolean;
  /** Encerra o atendimento atual (fecha o chat do usuário e limpa a sessão do técnico). */
  onEndSession?: () => void;
  lastError?: string | null;
  onClearError?: () => void;
  // New props for enhanced features
  isLoadingHistory?: boolean;
  notificationPermission?: NotificationPermission;
  onRequestNotificationPermission?: () => Promise<boolean>;
  onMarkMessagesAsRead?: () => void;
  /** Card do topo: usuário Windows remoto em atendimento. */
  attendedUserInfo?: {
    name: string;
    avatar?: string;
    role: string;
    department?: string;
  };
  /** Dados conhecidos da máquina que originou este atendimento. */
  sessionTarget?: ChatSessionTarget;
}

export function ChatView({
  messages,
  status,
  remotePresence,
  remoteUserInfo,
  onSendText,
  onSendFile,
  onDeleteMessage,
  onRetry,
  onTyping,
  remoteTyping = false,
  onEndSession,
  lastError,
  onClearError,
  isLoadingHistory = false,
  notificationPermission = 'default',
  onRequestNotificationPermission,
  onMarkMessagesAsRead,
  attendedUserInfo,
  sessionTarget,
}: ChatViewProps) {
  const [fileAlert, setFileAlert] = useState<FileAlert>(null);
  const [errorAlert, setErrorAlert] = useState<FileAlert>(null);
  // A ChatView só é montada quando a aba "chat" está ativa; "viewing" reflete
  // foco + visibilidade da janela para o divisor de não-lidas.
  const [viewing, setViewing] = useState(true);
  const { savingFile, save: handleSaveFile } = useSaveReceivedFile(setFileAlert);
  const fileAttachment = useFileAttachment(
    onSendFile,
    "Arquivo muito grande. Máximo: 10MB",
    setFileAlert,
    () => {
      // Clear previous errors
      setErrorAlert(null);
      onClearError?.();
    },
  );

  const { containerRef, bottomRef, showJump, jumpToBottom } = useChatAutoScroll(
    messages.length,
  );
  const unreadBeforeId = useUnreadDivider(messages, viewing, !isLoadingHistory);
  const timeline = useMemo(
    () => buildChatTimeline(messages, unreadBeforeId),
    [messages, unreadBeforeId],
  );

  // Handle errors from chat hook
  useEffect(() => {
    if (lastError) {
      setErrorAlert({ ok: false, msg: lastError });
      // Auto-clear error after 5 seconds
      const timer = setTimeout(() => {
        setErrorAlert(null);
        onClearError?.();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastError, onClearError]);

  // Mark messages as read when user focuses on chat
  const handleWindowActive = useCallback(() => {
    setViewing(true);
    onMarkMessagesAsRead?.();
  }, [onMarkMessagesAsRead]);
  const handleWindowInactive = useCallback(() => setViewing(false), []);
  useWindowFocus(handleWindowActive, handleWindowInactive);

  const handleSend = (text: string) => {
    setErrorAlert(null); // Clear previous errors
    onClearError?.(); // Clear hook errors
    onSendText(text);
  };

  const connected = status === "connected" || status === "idle";
  const confirmEndSession = () => {
    if (onEndSession && window.confirm("Encerrar o atendimento? O chat do usuário será fechado.")) {
      onEndSession();
    }
  };

  return (
    <PageShell variant="singleColumn" maxWidthClassName="w-full" className="h-full min-h-0">
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
      <input
        ref={fileAttachment.inputRef}
        type="file"
        className="hidden"
        onChange={fileAttachment.onChange}
        accept={ACCEPTED_FILE_TYPES}
      />

      {attendedUserInfo && (
        <TechnicianHeader
          attendedUser={attendedUserInfo}
          remotePresence={remotePresence}
          isConnected={connected}
          onEndSession={onEndSession ? confirmEndSession : undefined}
        />
      )}

      {/* Notification Permission Banner */}
      {onRequestNotificationPermission && (
        <NotificationPermissionBanner
          permission={notificationPermission}
          onRequestPermission={onRequestNotificationPermission}
          techName={remoteUserInfo?.name || 'usuário'}
        />
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_288px]">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <div
          ref={containerRef}
          className="flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-4 py-4"
        >
          {/* Loading history indicator */}
          {isLoadingHistory && (
            <div className="flex items-center justify-center gap-2 py-4">
              <DotsLoader />
              <span className="text-sm text-ink-muted">Carregando histórico...</span>
            </div>
          )}

          {!isLoadingHistory && messages.length === 0 ? (
            <ChatEmptyState connected={connected} remotePresence={remotePresence} />
          ) : (
            <ChatTimeline
              timeline={timeline}
              renderMessage={(item) => (
                <div key={item.key} className="min-w-0">
                  <ChatMessage
                    msg={item.msg}
                    savingFile={savingFile}
                    onSaveFile={handleSaveFile}
                    onDeleteMessage={onDeleteMessage}
                    onRetry={onRetry}
                    showDeleteOption={true}
                  />
                </div>
              )}
            />
          )}
          <div ref={bottomRef} />
        </div>

        {/* Botão flutuante: rolar para o fim quando há mensagens abaixo. */}
        {showJump && (
          <button
            type="button"
            onClick={() => jumpToBottom()}
            className="focus-ring absolute bottom-3 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition hover:border-accent/40 hover:text-accent-soft active:scale-95"
            title="Ir para a última mensagem"
            aria-label="Ir para a última mensagem"
          >
            <ChevronDown size={18} />
          </button>
        )}

        <ChatComposer
          status={status}
          fileAlert={fileAlert}
          errorAlert={errorAlert}
          remoteTyping={remoteTyping}
          remoteName={remoteUserInfo?.name || "Usuário"}
          onAttach={fileAttachment.open}
          onTyping={onTyping}
          onSend={handleSend}
        />
      </div>
      <TechnicianSessionPanel
        target={sessionTarget}
        remoteName={attendedUserInfo?.name || remoteUserInfo?.name || "Usuário"}
        remotePresence={remotePresence}
        status={status}
        onAttachFile={fileAttachment.open}
        onEndSession={onEndSession ? confirmEndSession : undefined}
      />
      </div>
      </div>
    </PageShell>
  );
}
