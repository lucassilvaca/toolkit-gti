import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isWsFileMessage } from "../../../shared/types/chat";
import type { WsChatMessage, WsPresenceState } from "../../../shared/types/chat";
import { DEFAULT_TITLE, playMessageArrivalChime, type RoomParams } from "../utils/chatWindow";

const currentWindow = getCurrentWindow();

const IDLE_DESTROY_MS = 10 * 60 * 1000;
const OFFLINE_DESTROY_MS = 6000;
const SESSION_END_DESTROY_MS = 1600;

/** Título da janela conforme o técnico do convite. */
export function sessionTitle(params: RoomParams | null): string {
  return params?.adminName ? `Chat - Atendimento com ${params.adminName}` : DEFAULT_TITLE;
}

function destroyWindow() {
  void currentWindow.destroy().catch(() => {});
}

/** Toast do sistema quando a janela não está ativa. */
async function alertUserAboutIncomingMessage(message: WsChatMessage, techName: string) {
  const isWindowFocused = await currentWindow.isFocused().catch(() => true);
  const isWindowVisible = await currentWindow.isVisible().catch(() => true);
  if (isWindowFocused && isWindowVisible && document.visibilityState === "visible") return;

  const raw = isWsFileMessage(message) ? `Arquivo: ${message.filename}` : message.content;
  const oneLine = raw.replace(/\s+/g, " ").trim();
  const short = oneLine.length > 140 ? `${oneLine.slice(0, 140)}…` : oneLine;

  playMessageArrivalChime();

  try {
    await invoke("show_chat_desktop_toast", {
      title: "Mensagem recebida",
      subtitle: `Técnico: ${techName}`,
      body: short || "Abra o chat para ler.",
    });
  } catch (error) {
    console.warn("Notificação nativa indisponível:", error);
  }
}

interface UseUserChatWindowParams {
  params: RoomParams | null;
  technicianPresence: WsPresenceState;
}

/**
 * Ciclo de vida da janela do usuário: título/contador de não-lidas, presença
 * local (foco/visibilidade), alerta de mensagem recebida e auto-fechamento.
 * A janela não fecha pelo X (prevent_close no backend). Ela só encerra:
 *  1) após 10 min sem nenhuma mensagem trocada (ver useIdleWindowDestroy),
 *  2) quando o técnico sai (presença offline estável), ou
 *  3) quando o técnico encerra a sessão. destroy() ignora o prevent_close.
 */
export function useUserChatWindow({ params, technicianPresence }: UseUserChatWindowParams) {
  const [presenceState, setPresenceState] = useState<"active" | "away">("active");
  const [endedByTech, setEndedByTech] = useState(false);
  const unreadCountRef = useRef(0);
  const sessionEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    currentWindow.setTitle(sessionTitle(params)).catch(() => {});
  }, [params]);

  // Handlers de foco/visibilidade para presença e mensagens não lidas.
  useEffect(() => {
    const markActive = () => setPresenceState("active");
    const markAway = () => setPresenceState("away");

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        markActive();
        unreadCountRef.current = 0;
        currentWindow.setTitle(DEFAULT_TITLE).catch(() => {});
      } else {
        markAway();
      }
    };

    window.addEventListener("focus", markActive);
    window.addEventListener("blur", markAway);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", markActive);
      window.removeEventListener("blur", markAway);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (technicianPresence !== "offline") return;
    const timer = setTimeout(destroyWindow, OFFLINE_DESTROY_MS);
    return () => clearTimeout(timer);
  }, [technicianPresence]);

  useEffect(
    () => () => {
      if (sessionEndTimerRef.current) clearTimeout(sessionEndTimerRef.current);
    },
    [],
  );

  const notifyIncomingMessage = (message: WsChatMessage) => {
    void (async () => {
      const visible = await currentWindow.isVisible().catch(() => true);
      const focused = await currentWindow.isFocused().catch(() => true);
      const docHidden = document.visibilityState !== "visible";
      const userNotActivelyReading = !visible || !focused || docHidden;

      if (userNotActivelyReading) {
        unreadCountRef.current += 1;
        currentWindow.setTitle(`(${unreadCountRef.current}) ${DEFAULT_TITLE}`).catch(() => {});

        // Janela escondida pelo X: reexibe quando o técnico escreve.
        if (!visible) {
          await currentWindow.unminimize().catch(() => {});
          await currentWindow.show().catch(() => {});
        }

        await alertUserAboutIncomingMessage(message, params?.adminName || "Técnico");

        try {
          await currentWindow.requestUserAttention(1);
        } catch (error) {
          console.warn("Failed to request user attention:", error);
        }
      }
    })();
  };

  /** Zera o contador de não-lidas e restaura o título da sessão. */
  const resetUnreadTitle = () => {
    unreadCountRef.current = 0;
    currentWindow.setTitle(sessionTitle(params)).catch(() => {});
  };

  /** Técnico encerrou: mostra aviso breve e fecha a janela de fato. */
  const handleSessionEnd = () => {
    setEndedByTech(true);
    if (sessionEndTimerRef.current) clearTimeout(sessionEndTimerRef.current);
    sessionEndTimerRef.current = setTimeout(destroyWindow, SESSION_END_DESTROY_MS);
  };

  return { presenceState, endedByTech, notifyIncomingMessage, resetUnreadTitle, handleSessionEnd };
}

/**
 * Fecha a janela após 10 min sem mensagens trocadas. Separado de
 * useUserChatWindow porque depende das mensagens do WebSocket, que por sua vez
 * consome a presença/callbacks daquele hook.
 */
export function useIdleWindowDestroy(liveMessageCount: number) {
  useEffect(() => {
    const timer = setTimeout(destroyWindow, IDLE_DESTROY_MS);
    return () => clearTimeout(timer);
  }, [liveMessageCount]);
}
