import { useCallback, useMemo, useState } from "react";
import type { WsConnectionStatus, WsPresenceState } from "../../../shared/types/chat";

/** Dados conhecidos da máquina chamada para o atendimento. */
export interface ChatSessionTarget {
  /** IP ou hostname usado para chamar a máquina. */
  address: string;
  hostname?: string;
  username?: string;
  online?: boolean;
  /** Indica se a máquina respondeu ao endpoint do Toolkit durante a descoberta. */
  hasToolkit?: boolean;
  uptimeSeconds?: number | null;
  /** Epoch (segundos) da última resposta na descoberta de rede. */
  lastSeen?: number | null;
}

/** Abre (ou foca) a conversa de uma sala e leva o técnico até ela. */
export type GoToChat = (roomId: string, wsUrl: string, label?: string, target?: ChatSessionTarget) => void;

/** Sala que o técnico está atendendo (um item por conversa aberta). */
export interface ChatSessionRef {
  roomId: string;
  wsUrl: string;
  /** Rótulo inicial da aba (ex.: host chamado) até o usuário anunciar seu login. */
  label?: string;
  target?: ChatSessionTarget;
}

/**
 * Resumo que cada sessão viva reporta ao gerenciador. Alimenta a barra de abas
 * (nome, badge de não-lidas, ponto de presença) sem que o gerenciador precise
 * conhecer o socket de cada conversa.
 */
export interface ChatSessionSummary {
  unreadCount: number;
  remotePresence: WsPresenceState;
  displayName: string;
  status: WsConnectionStatus;
}

const EMPTY_SUMMARY: ChatSessionSummary = {
  unreadCount: 0,
  remotePresence: "unknown",
  displayName: "",
  status: "connecting",
};

export interface ChatSessionsManager {
  sessions: ChatSessionRef[];
  activeRoomId: string | null;
  /** A aba "chat" do app está selecionada? (define presença ativa da sessão visível) */
  isChatTabOpen: boolean;
  totalUnread: number;
  /** Salas em processo de encerramento gracioso (session_end enviado, aguardando remoção). */
  closingRoomIds: string[];
  getSummary: (roomId: string) => ChatSessionSummary;
  /** Abre uma nova conversa (ou foca uma já aberta) e a torna ativa. */
  openSession: GoToChat;
  /**
   * Pede o encerramento gracioso: marca a sala como "encerrando" para que o
   * controller (ainda montado) envie o frame `session_end` antes de sumir.
   * A remoção de fato acontece depois, via `closeSession`.
   */
  requestClose: (roomId: string) => void;
  closeSession: (roomId: string) => void;
  setActive: (roomId: string) => void;
  setChatTabOpen: (open: boolean) => void;
  reportSummary: (roomId: string, summary: ChatSessionSummary) => void;
  closeAll: () => void;
}

/**
 * Gerencia N conversas simultâneas do técnico. Guarda apenas a LISTA de salas e
 * qual está ativa — o socket, o histórico e a presença de cada uma vivem em uma
 * instância de `usePersistentChatSession` dentro do `ChatSessionController`
 * correspondente, que reporta seu resumo aqui via `reportSummary`.
 */
export function useChatSessions(): ChatSessionsManager {
  const [sessions, setSessions] = useState<ChatSessionRef[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isChatTabOpen, setIsChatTabOpen] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, ChatSessionSummary>>({});
  const [closingRoomIds, setClosingRoomIds] = useState<string[]>([]);

  const openSession = useCallback<GoToChat>((roomId, wsUrl, label, target) => {
    setSessions((prev) => {
      const existing = prev.find((session) => session.roomId === roomId);
      if (!existing) return [...prev, { roomId, wsUrl, label, target }];

      // Uma reabertura pode trazer dados mais completos do destino; preserva os
      // já conhecidos quando a chamada não os informar novamente.
      if (!target || existing.target) return prev;
      return prev.map((session) => session.roomId === roomId ? { ...session, target } : session);
    });
    // Reabrir uma sala que estava encerrando cancela o encerramento.
    setClosingRoomIds((prev) => prev.filter((id) => id !== roomId));
    setActiveRoomId(roomId);
  }, []);

  const requestClose = useCallback((roomId: string) => {
    setClosingRoomIds((prev) => (prev.includes(roomId) ? prev : [...prev, roomId]));
  }, []);

  const closeSession = useCallback((roomId: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.roomId !== roomId);
      // Se a sala fechada era a ativa, promove a vizinha mais próxima.
      setActiveRoomId((current) => {
        if (current !== roomId) return current;
        const idx = prev.findIndex((s) => s.roomId === roomId);
        const fallback = next[Math.min(idx, next.length - 1)];
        return fallback ? fallback.roomId : null;
      });
      return next;
    });
    setSummaries((prev) => {
      if (!(roomId in prev)) return prev;
      const { [roomId]: _removed, ...rest } = prev;
      return rest;
    });
    setClosingRoomIds((prev) => prev.filter((id) => id !== roomId));
  }, []);

  const setActive = useCallback((roomId: string) => setActiveRoomId(roomId), []);
  const setChatTabOpen = useCallback((open: boolean) => setIsChatTabOpen(open), []);

  const reportSummary = useCallback((roomId: string, summary: ChatSessionSummary) => {
    setSummaries((prev) => {
      const cur = prev[roomId];
      // Só atualiza se algum campo mudou — evita re-render/loop em cascata,
      // já que o controller reporta a cada render da sessão.
      if (
        cur &&
        cur.unreadCount === summary.unreadCount &&
        cur.remotePresence === summary.remotePresence &&
        cur.displayName === summary.displayName &&
        cur.status === summary.status
      ) {
        return prev;
      }
      return { ...prev, [roomId]: summary };
    });
  }, []);

  const closeAll = useCallback(() => {
    setSessions([]);
    setActiveRoomId(null);
    setSummaries({});
    setClosingRoomIds([]);
  }, []);

  const getSummary = useCallback(
    (roomId: string) => summaries[roomId] ?? EMPTY_SUMMARY,
    [summaries],
  );

  const totalUnread = useMemo(
    () => Object.values(summaries).reduce((sum, s) => sum + s.unreadCount, 0),
    [summaries],
  );

  return useMemo(
    () => ({
      sessions,
      activeRoomId,
      isChatTabOpen,
      totalUnread,
      closingRoomIds,
      getSummary,
      openSession,
      requestClose,
      closeSession,
      setActive,
      setChatTabOpen,
      reportSummary,
      closeAll,
    }),
    [
      sessions,
      activeRoomId,
      isChatTabOpen,
      totalUnread,
      closingRoomIds,
      getSummary,
      openSession,
      requestClose,
      closeSession,
      setActive,
      setChatTabOpen,
      reportSummary,
      closeAll,
    ],
  );
}
