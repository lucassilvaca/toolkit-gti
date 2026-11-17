import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronDown, MessageSquare } from "lucide-react";
import type { WsPresenceState } from "../../../shared/types/chat";
import { useChatWebSocket } from "../hooks/useChatWebSocket";
import { useChatAutoScroll } from "../hooks/useChatAutoScroll";
import { useUnreadDivider } from "../hooks/useUnreadDivider";
import { useUserChatHistory } from "../hooks/useUserChatHistory";
import { useFileAttachment, useSaveReceivedFile, type FileAlert } from "../hooks/useChatFiles";
import { useIdleWindowDestroy, useUserChatWindow } from "../hooks/useUserChatWindow";
import { buildChatTimeline } from "../utils/timeline";
import { ChatTimeline } from "../components/ChatTimeline";
import { UserChatBubble } from "../components/UserChatBubble";
import { UserChatComposer } from "../components/UserChatComposer";
import { UserChatHeader } from "../components/UserChatHeader";
import { UserChatStatusScreen } from "../components/UserChatStatusScreen";
import { getRoomFromUrl, getTechnicianStatus, type RoomParams } from "../utils/chatWindow";
import { DotsLoader, PageShell } from "../../../shared/components";
import { ACCEPTED_FILE_TYPES } from "../../../shared/constants/chat";
import { getCurrentUser } from "../../auth/services/currentUser";

const currentWindow = getCurrentWindow();

export function UserChatView() {
  const [params] = useState<RoomParams | null>(getRoomFromUrl);
  const [initError, setInitError] = useState("");
  const [fileAlert, setFileAlert] = useState<FileAlert>(null);
  const { savingFile, save: handleSaveFile } = useSaveReceivedFile(setFileAlert);
  const [technicianPresence, setTechnicianPresence] = useState<WsPresenceState>("unknown");
  const [userLogin, setUserLogin] = useState<string>("");

  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Info do técnico a partir dos parâmetros do convite.
  const technicianInfo = useMemo(
    () =>
      params?.adminName
        ? { name: params.adminName, role: "Suporte Técnico", department: "Tecnologia da Informação" }
        : null,
    [params?.adminName],
  );

  const { presenceState, endedByTech, notifyIncomingMessage, resetUnreadTitle, handleSessionEnd } =
    useUserChatWindow({ params, technicianPresence });

  // Login Windows da máquina (usado nos metadados de sessão minimizada).
  useEffect(() => {
    if (!params) return;
    void (async () => {
      try {
        const u = await getCurrentUser();
        setUserLogin((u ?? "").trim() || "Usuário");
      } catch {
        setUserLogin("Usuário");
      }
    })();
  }, [params]);

  useEffect(() => {
    if (params) return;
    initTimeoutRef.current = setTimeout(() => {
      setInitError("Não foi possível obter dados da sessão. Feche esta janela e tente novamente.");
    }, 100);
    return () => {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
    };
  }, [params]);

  const wsUrl = params ? `ws://${params.wsHost}/chat/${params.roomId}?token=${params.wsToken}` : "";

  const {
    messages: liveMessages,
    sendText,
    sendFile,
    status,
    remoteTyping,
    notifyTyping,
    markRead,
    retryMessage,
  } = useChatWebSocket(params?.roomId ?? "", wsUrl, {
    participantRole: "user",
    presenceState,
    onPresenceChange: (presence) => setTechnicianPresence(presence),
    onRemoteMessage: (message) => notifyIncomingMessage(message),
    onSessionEnd: handleSessionEnd,
  });

  const { allMessages, isLoadingHistory } = useUserChatHistory(params?.roomId, liveMessages);
  const fileAttachment = useFileAttachment(sendFile, "Arquivo muito grande. Maximo: 10MB", setFileAlert);

  // Ao reganhar foco/visibilidade, confirma leitura das mensagens pendentes.
  useEffect(() => {
    const onFocus = () => markRead();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [markRead]);

  const { containerRef, bottomRef, showJump, jumpToBottom } = useChatAutoScroll(
    allMessages.length,
  );
  // Usuário "vendo" a conversa = janela com foco/visível (presença ativa).
  const unreadBeforeId = useUnreadDivider(allMessages, presenceState === "active", !isLoadingHistory);
  const timeline = useMemo(
    () => buildChatTimeline(allMessages, unreadBeforeId),
    [allMessages, unreadBeforeId],
  );

  const connected = status === "connected" || status === "idle";
  const technicianStatus = getTechnicianStatus(technicianPresence, connected);

  useIdleWindowDestroy(liveMessages.length);

  const handleSend = (text: string) => {
    sendText(text);
    resetUnreadTitle();
  };

  const handleHide = () => {
    // Minimiza para a barra de tarefas (nunca esconde): o usuário final só vê
    // esta janela e precisa conseguir recuperá-la sozinho pela barra.
    currentWindow.minimize().catch(() => {});
    localStorage.setItem(
      "minimized_chat_session",
      JSON.stringify({
        userLogin,
        roomId: params?.roomId,
        wsHost: params?.wsHost,
        timestamp: Date.now(),
      }),
    );
  };

  if (endedByTech) return <UserChatStatusScreen kind="ended" />;
  if (initError) return <UserChatStatusScreen kind="error" message={initError} />;
  if (!params) return <UserChatStatusScreen kind="waiting" />;

  return (
    <PageShell variant="singleColumn" maxWidthClassName="w-full" className="h-full">
      <div className="relative flex h-full flex-col overflow-hidden bg-base text-ink">
        <input
          ref={fileAttachment.inputRef}
          type="file"
          className="hidden"
          onChange={fileAttachment.onChange}
          accept={ACCEPTED_FILE_TYPES}
        />

        <div className="flex-none border-b border-surface-raised/50 bg-surface/50">
          {technicianInfo && (
            <UserChatHeader
              technicianInfo={technicianInfo}
              status={technicianStatus}
              onHide={handleHide}
            />
          )}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={containerRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-line"
          >
            {isLoadingHistory && (
              <div className="flex items-center justify-center gap-2 py-4">
                <DotsLoader />
                <span className="text-sm text-ink-muted">Carregando histórico da conversa...</span>
              </div>
            )}

            {!isLoadingHistory && allMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-accent-soft/20 bg-accent/10">
                  <MessageSquare size={28} className="text-accent-soft opacity-60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">
                    {connected ? "Conectado ao suporte" : "Aguardando suporte"}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {connected ? "Envie uma mensagem para iniciar" : "A conexão será retomada automaticamente"}
                  </p>
                </div>
              </div>
            ) : (
              !isLoadingHistory && (
                <ChatTimeline
                  timeline={timeline}
                  renderMessage={(item) => (
                    <UserChatBubble
                      key={item.key}
                      msg={item.msg}
                      savingFile={savingFile}
                      onSaveFile={handleSaveFile}
                      onRetry={retryMessage}
                    />
                  )}
                />
              )
            )}
            <div ref={bottomRef} />
          </div>

          {/* Botão flutuante: rolar para o fim quando há mensagens abaixo. */}
          {showJump && (
            <button
              type="button"
              onClick={() => jumpToBottom()}
              className="focus-ring absolute bottom-3 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-line/50 bg-surface-overlay/90 text-ink shadow-lg backdrop-blur transition hover:border-accent/40 hover:text-accent-soft active:scale-95"
              title="Ir para a última mensagem"
              aria-label="Ir para a última mensagem"
            >
              <ChevronDown size={18} />
            </button>
          )}
        </div>

        <UserChatComposer
          connected={connected}
          fileAlert={fileAlert}
          remoteTyping={remoteTyping}
          technicianName={technicianInfo?.name || "Técnico"}
          onAttach={fileAttachment.open}
          onTyping={notifyTyping}
          onSend={handleSend}
        />
      </div>
    </PageShell>
  );
}
