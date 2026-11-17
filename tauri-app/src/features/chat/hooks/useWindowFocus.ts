import { useEffect } from "react";

/**
 * Chama `onActive` quando a janela ganha foco ou fica visível e `onInactive`
 * quando perde foco ou fica oculta. Passe callbacks estáveis (useCallback).
 */
export function useWindowFocus(onActive: () => void, onInactive: () => void) {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") onActive();
      else onInactive();
    };

    window.addEventListener("focus", onActive);
    window.addEventListener("blur", onInactive);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", onActive);
      window.removeEventListener("blur", onInactive);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onActive, onInactive]);
}
