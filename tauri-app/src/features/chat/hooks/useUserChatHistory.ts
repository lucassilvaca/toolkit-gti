import { useEffect, useMemo, useRef, useState } from "react";
import type { WsChatMessage } from "../../../shared/types/chat";
import { loadHistory, saveHistory } from "../services/chatHistory";

/** Mensagem ao vivo já presente no histórico carregado (evita duplicar). */
function existsInHistory(history: WsChatMessage[], live: WsChatMessage): boolean {
  return history.some(
    (h) =>
      h.timestamp === live.timestamp &&
      h.sender === live.sender &&
      (h.type === "text"
        ? h.type === live.type && h.content === live.content
        : h.type === "file"
          ? live.type === "file" && h.filename === live.filename
          : false),
  );
}

/**
 * Carrega o histórico em disco da sala, mescla com as mensagens ao vivo (sem
 * duplicatas) e persiste com debounce. Isola toda a lógica de persistência da
 * janela do usuário.
 */
export function useUserChatHistory(
  roomId: string | undefined,
  liveMessages: WsChatMessage[],
) {
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historicalMessages, setHistoricalMessages] = useState<WsChatMessage[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Histórico isolado por sala (roomId): cada nova call = conversa nova.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setIsLoadingHistory(true);
    void loadHistory(roomId).then((saved) => {
      if (cancelled) return;
      if (saved.length > 0) setHistoricalMessages(saved);
      setIsLoadingHistory(false);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const allMessages = useMemo<WsChatMessage[]>(() => {
    if (isLoadingHistory) return historicalMessages;
    const combined = [...historicalMessages];
    liveMessages.forEach((live) => {
      if (!existsInHistory(historicalMessages, live)) combined.push(live);
    });
    return combined.sort((a, b) => a.timestamp - b.timestamp);
  }, [historicalMessages, liveMessages, isLoadingHistory]);

  useEffect(() => {
    if (!roomId || allMessages.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveHistory(roomId, allMessages);
    }, 1500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [allMessages, roomId]);

  return { allMessages, isLoadingHistory };
}
