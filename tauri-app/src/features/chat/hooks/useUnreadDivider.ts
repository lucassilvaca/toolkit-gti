import { useEffect, useRef, useState } from "react";
import type { WsChatMessage } from "../../../shared/types/chat";

function newestTimestamp(messages: WsChatMessage[], floor: number): number {
  return messages.reduce((max, m) => Math.max(max, m.timestamp), floor);
}

/**
 * Calcula onde inserir o divisor de "novas mensagens".
 *
 * Modelo (estilo WhatsApp):
 * - Quando a conversa é vista pela primeira vez, todo o histórico já carregado
 *   conta como lido (sem divisor para mensagens antigas).
 * - O divisor é fixado **ao abrir** a conversa, antes da primeira mensagem do
 *   remoto que chegou enquanto o usuário estava ausente.
 * - Ao sair da conversa, tudo é marcado como lido e o divisor some.
 *
 * @param messages   mensagens ordenadas por tempo
 * @param isViewing  usuário está olhando a conversa (foco + visível + aba ativa)
 * @param ready      histórico já carregado (evita marcar tudo como não-lido)
 * @returns id da mensagem que deve receber o divisor logo acima, ou null
 */
export function useUnreadDivider(
  messages: WsChatMessage[],
  isViewing: boolean,
  ready: boolean,
): string | null {
  const lastReadRef = useRef<number | null>(null);
  const sessionActiveRef = useRef(false);
  const [dividerId, setDividerId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    // Primeira vez com dados prontos: histórico existente é considerado lido.
    if (lastReadRef.current === null) {
      lastReadRef.current = newestTimestamp(messages, 0);
      return;
    }

    if (isViewing) {
      // Abriu a conversa: fixa o divisor uma vez por "sessão de leitura".
      if (!sessionActiveRef.current) {
        sessionActiveRef.current = true;
        const boundary = lastReadRef.current;
        const firstUnread = messages.find(
          (m) => m.sender === "remote" && m.timestamp > boundary,
        );
        setDividerId(firstUnread ? firstUnread.id : null);
      }
    } else if (sessionActiveRef.current) {
      // Saiu: marca tudo como lido e limpa o divisor.
      sessionActiveRef.current = false;
      lastReadRef.current = newestTimestamp(messages, lastReadRef.current);
      setDividerId(null);
    }
  }, [ready, isViewing, messages]);

  return dividerId;
}
