import { useCallback, useEffect, useRef, useState } from "react";

/** Distância (px) do fundo a partir da qual consideramos "está no fim". */
const NEAR_BOTTOM_PX = 120;

/**
 * Auto-scroll inteligente para listas de chat.
 *
 * - Rola para o fim quando chega conteúdo novo **somente** se o usuário já
 *   estava perto do fim (não interrompe quem está lendo histórico acima).
 * - Expõe `showJump` (true quando há conteúdo abaixo da viewport) e
 *   `jumpToBottom` para o botão flutuante de "rolar para o fim".
 *
 * @param contentKey valor que muda quando chega mensagem nova (ex.: length).
 */
export function useChatAutoScroll(contentKey: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  const jumpToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
    atBottomRef.current = true;
    setShowJump(false);
  }, []);

  // Acompanha a posição de rolagem para decidir auto-scroll e botão.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const near = isNearBottom();
      atBottomRef.current = near;
      setShowJump(!near);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isNearBottom]);

  // Conteúdo novo: rola se já estava no fim; senão, sinaliza o botão.
  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setShowJump(true);
    }
  }, [contentKey]);

  return { containerRef, bottomRef, showJump, jumpToBottom };
}
