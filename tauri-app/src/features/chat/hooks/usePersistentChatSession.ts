import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WsChatMessage, WsPresenceState } from "../../../shared/types/chat";
import { loadHistory, saveHistory } from "../services/chatHistory";
import { withSenderInfo } from "../utils/senderInfo";
import { useChatWebSocket } from "./useChatWebSocket";
import { useChatNotifications } from "./useChatNotifications";

interface StartChatSessionInput {
  roomId: string;
  wsUrl: string;
}

export interface PersistentChatSession {
  hasActiveSession: boolean;
  messages: WsChatMessage[];
  status: ReturnType<typeof useChatWebSocket>["status"];
  unreadCount: number;
  remotePresence: WsPresenceState;
  startSession: (input: StartChatSessionInput) => void;
  markChatTabActive: (active: boolean) => void;
  clearSession: () => void;
  sendText: (content: string) => void;
  sendFile: (filename: string, mimeType: string, fileData: string) => void;
  deleteMessage: (messageId: string) => void;
  lastError: string | null;
  clearError: () => void;
  // New features
  isLoadingHistory: boolean;
  notificationPermission: NotificationPermission;
  requestNotificationPermission: () => Promise<boolean>;
  markMessagesAsRead: () => void;
  /** Login Windows do usuário remoto (anunciado pelo cliente na sala WS). */
  remoteClientDisplayName: string;
  // Status layer (Phase B)
  remoteTyping: boolean;
  notifyTyping: () => void;
  stopTyping: () => void;
  retryMessage: (messageId: string) => void;
  /** Avisa o usuário para fechar a conversa e encerra o atendimento. */
  endSession: () => void;
}

export function usePersistentChatSession(): PersistentChatSession {
  const [roomId, setRoomId] = useState("");
  const [wsUrl, setWsUrl] = useState("");
  const [chatTabActive, setChatTabActive] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [remotePresence, setRemotePresence] = useState<WsPresenceState>("unknown");
  const [remoteClientDisplayName, setRemoteClientDisplayName] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasActiveSession = roomId.trim().length > 0 && wsUrl.trim().length > 0;

  // Histórico via comando legado (único que existe no backend).
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Notifications hook
  const {
    permission: notificationPermission,
    isWindowFocused,
    requestPermission: requestNotificationPermission,
    showMessageNotification,
    showStatusNotification,
  } = useChatNotifications({
    techName: 'Técnico GTI',
    remotePeerName: remoteClientDisplayName.trim() || "Usuário",
    enabled: hasActiveSession
  });

  // Refs voláteis: permitem que o callback de mensagem remota (estável) leia
  // sempre o valor MAIS RECENTE de chatTabActive/isWindowFocused, em vez de
  // capturá-los num closure que poderia ficar defasado entre frames do WS.
  const chatTabActiveRef = useRef(chatTabActive);
  const isWindowFocusedRef = useRef(isWindowFocused);
  const previousRemotePresenceRef = useRef<WsPresenceState>("unknown");
  useEffect(() => {
    chatTabActiveRef.current = chatTabActive;
  }, [chatTabActive]);
  useEffect(() => {
    isWindowFocusedRef.current = isWindowFocused;
  }, [isWindowFocused]);

  useEffect(() => {
    const previous = previousRemotePresenceRef.current;
    previousRemotePresenceRef.current = remotePresence;
    if (previous === "unknown" || previous === remotePresence || remotePresence !== "offline") return;
    if (chatTabActive || isWindowFocused) return;
    void showStatusNotification(
      "Atendimento desconectado",
      `${remoteClientDisplayName.trim() || "O usuário"} saiu do chat.`,
    );
  }, [remotePresence, chatTabActive, isWindowFocused, remoteClientDisplayName, showStatusNotification]);

  const handleRemoteMessage = useCallback(
    (message: WsChatMessage) => {
      const tabActive = chatTabActiveRef.current;
      const windowFocused = isWindowFocusedRef.current;

      // Incrementa não-lidas quando a aba não está ativa nem em foco.
      if (!tabActive && !windowFocused) {
        setUnreadCount((current) => current + 1);
      }

      // Notifica apenas mensagens do remoto quando o técnico não está olhando.
      if (message.sender === "remote" && (!tabActive || !windowFocused)) {
        showMessageNotification(message);
      }
    },
    [showMessageNotification],
  );

  const {
    messages,
    sendText,
    sendFile,
    status,
    deleteMessage,
    lastError,
    clearError,
    remoteTyping,
    notifyTyping,
    stopTyping,
    markRead: markReadWs,
    retryMessage,
    seedHistory,
    endSession,
  } = useChatWebSocket(roomId, wsUrl, {
    participantRole: "tech",
    presenceState: chatTabActive ? "active" : "away",
    onPresenceChange: (presence) => setRemotePresence(presence),
    onRemoteClientIdentity: (displayName) => {
      setRemoteClientDisplayName(displayName);
    },
    onRemoteMessage: handleRemoteMessage,
    enableLanguageFilter: true,
    onMessageError: (error, messageType) => {
      console.warn(`Chat message error (${messageType}):`, error);
      // Error is handled by the hook itself via lastError
    },
  });

  // Carrega o histórico do disco (comando legado) e semeia no hook.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setIsLoadingHistory(true);
    void loadHistory(roomId).then((history) => {
      if (cancelled) return;
      seedHistory(history);
      setIsLoadingHistory(false);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId, seedHistory]);

  const messagesForUi = useMemo(
    () =>
      withSenderInfo(messages, {
        remoteName: remoteClientDisplayName.trim() || "Usuário",
        remotePresence,
        localPresence: chatTabActive ? "active" : "away",
      }),
    [messages, remoteClientDisplayName, remotePresence, chatTabActive],
  );

  // Save chat history with debouncing
  useEffect(() => {
    if (!hasActiveSession || messages.length === 0) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void saveHistory(roomId, messages);
    }, 1200);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [hasActiveSession, messages, roomId]);

  // Mark messages as read when tab becomes active (recibo de leitura via WS).
  useEffect(() => {
    if (chatTabActive && isWindowFocused) {
      if (unreadCount > 0) setUnreadCount(0);
      markReadWs();
    }
  }, [chatTabActive, isWindowFocused, unreadCount, markReadWs, messagesForUi]);

  useEffect(() => {
    if (chatTabActive) {
      setUnreadCount(0);
    }
  }, [chatTabActive]);

  const startSession = useCallback(({ roomId: nextRoomId, wsUrl: nextWsUrl }: StartChatSessionInput) => {
    setRoomId(nextRoomId);
    setWsUrl(nextWsUrl);
    setUnreadCount(0);
    setRemotePresence("unknown");
    setRemoteClientDisplayName("");
  }, []);

  const clearSession = useCallback(() => {
    setRoomId("");
    setWsUrl("");
    setUnreadCount(0);
    setRemotePresence("unknown");
    setRemoteClientDisplayName("");
  }, []);

  const markChatTabActive = useCallback((active: boolean) => setChatTabActive(active), []);

  const markMessagesAsRead = useCallback(() => {
    setUnreadCount(0);
    markReadWs();
  }, [markReadWs]);

  return useMemo(
    () => ({
      hasActiveSession,
      messages: messagesForUi,
      status,
      unreadCount,
      remotePresence,
      startSession,
      markChatTabActive,
      clearSession,
      sendText,
      sendFile,
      deleteMessage,
      lastError,
      clearError,
      // New features
      isLoadingHistory,
      notificationPermission,
      requestNotificationPermission,
      markMessagesAsRead,
      remoteClientDisplayName,
      // Status layer (Phase B)
      remoteTyping,
      notifyTyping,
      stopTyping,
      retryMessage,
      endSession,
    }),
    [
      clearSession,
      hasActiveSession,
      markChatTabActive,
      messagesForUi,
      remotePresence,
      sendFile,
      sendText,
      startSession,
      status,
      unreadCount,
      deleteMessage,
      lastError,
      clearError,
      isLoadingHistory,
      notificationPermission,
      requestNotificationPermission,
      markMessagesAsRead,
      remoteClientDisplayName,
      remoteTyping,
      notifyTyping,
      stopTyping,
      retryMessage,
      endSession,
    ],
  );
}
