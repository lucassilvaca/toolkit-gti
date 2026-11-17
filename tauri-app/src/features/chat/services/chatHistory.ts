import { safeInvoke } from "../../../shared/services/tauri";
import { persistedToWs, wsToPersisted } from "../../../shared/types/chat";
import type { PersistedChatMessage, WsChatMessage } from "../../../shared/types/chat";

/** Carrega o histórico em disco da sala. Nunca lança: falha vira lista vazia. */
export async function loadHistory(roomId: string): Promise<WsChatMessage[]> {
  const result = await safeInvoke<PersistedChatMessage[]>("load_chat_history", { ip: roomId });
  return result.ok && Array.isArray(result.value) ? result.value.map(persistedToWs) : [];
}

/** Persiste o histórico da sala. Nunca lança (falha só é logada). */
export async function saveHistory(roomId: string, messages: WsChatMessage[]): Promise<void> {
  await safeInvoke("save_chat_history", { ip: roomId, messages: messages.map(wsToPersisted) });
}
