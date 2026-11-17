import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface ChatInvitePayload {
  admin_ip: string;
  admin_name?: string;
  admin_host?: string;
}

/** Payload de `runtime-alert` (src-tauri/src/events/alerts.rs). */
export interface RuntimeAlert {
  kind: string;
  message: string;
}

export interface UseAppEventsOptions {
  onLock?: () => void;
  onUnlock?: () => void;
  onChatInvite?: (payload: ChatInvitePayload) => void;
  onChatMessage?: () => void;
  /** Alerta do runtime (chat, firewall, named pipe); `message` vazio = resolvido. */
  onRuntimeAlert?: (alert: RuntimeAlert) => void;
}

export function useAppEvents(options: UseAppEventsOptions): void {
  const { onLock, onUnlock, onChatInvite, onChatMessage, onRuntimeAlert } = options;

  useEffect(() => {
    // `listen` resolve de forma assíncrona: se o cleanup rodar antes (StrictMode,
    // troca de callbacks), a registração tardia é desfeita assim que resolve.
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    const track = (registration: Promise<UnlistenFn>) => {
      registration
        .then((unlisten) => {
          if (cancelled) unlisten();
          else unlisteners.push(unlisten);
        })
        .catch((error) => console.error("[useAppEvents] listen falhou:", error));
    };

    if (onLock) track(listen("app-locked", () => onLock()));
    if (onUnlock) track(listen("app-unlocked", () => onUnlock()));
    if (onChatInvite) {
      track(
        listen<ChatInvitePayload>("chat-invite-accepted", (event) => onChatInvite(event.payload)),
      );
    }
    if (onChatMessage) track(listen("chat-message", () => onChatMessage()));
    if (onRuntimeAlert) {
      track(listen<RuntimeAlert>("runtime-alert", (event) => onRuntimeAlert(event.payload)));
    }

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [onLock, onUnlock, onChatInvite, onChatMessage, onRuntimeAlert]);
}
