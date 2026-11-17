import type { WsChatMessage, WsPresenceState } from "../../../shared/types/chat";

interface SenderInfoContext {
  remoteName: string;
  remotePresence: WsPresenceState;
  localPresence: "active" | "away";
}

/** Anota cada mensagem com nome/papel/presença do remetente (visão do técnico). */
export function withSenderInfo(
  messages: WsChatMessage[],
  { remoteName, remotePresence, localPresence }: SenderInfoContext,
): WsChatMessage[] {
  return messages.map((m) =>
    m.sender === "remote"
      ? {
          ...m,
          senderInfo: {
            name: remoteName,
            role: "user" as const,
            presence: remotePresence,
          },
        }
      : {
          ...m,
          senderInfo: {
            name: "Você",
            role: "tech" as const,
            presence: localPresence,
          },
        },
  );
}
