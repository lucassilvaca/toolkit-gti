import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SessionInfo {
  user: string;
  authenticated_at: string;
  expires_in_minutes: number;
}

export interface UseAuthReturn {
  authenticated: boolean;
  user: string;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

interface UseAuthOptions {
  enabled?: boolean;
}

export function useAuth(options?: UseAuthOptions): UseAuthReturn {
  const enabled = options?.enabled ?? true;
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<string>("");

  // Dynamic session checking - frequency adjusts based on session expiry time
  // Strategy:
  // - Normal: Check every 5 minutes (reduces backend load)
  // - < 10 min: Check every 2 minutes
  // - < 5 min: Check every 1 minute
  // - < 2 min: Check every 30s
  // Sem renovação automática: a sessão admin expira por inatividade e o app
  // volta ao login, em vez de deixar telas admin abertas que falham.
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let currentInterval: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextCheck = (delayMs: number) => {
      if (currentInterval) {
        clearTimeout(currentInterval);
      }
      currentInterval = setTimeout(checkSession, delayMs);
    };

    const checkSession = async () => {
      try {
        const session = await invoke<SessionInfo | null>("get_session");
        if (session) {
          setAuthenticated(true);
          setUser(session.user);

          // Dynamic interval based on session expiry time
          let nextCheckInterval: number;

          if (session.expires_in_minutes < 2) {
            // Very close to expiry - check every 30 seconds
            nextCheckInterval = 30 * 1000;
          } else if (session.expires_in_minutes < 5) {
            // Close to expiry - check every minute
            nextCheckInterval = 60 * 1000;
          } else if (session.expires_in_minutes < 10) {
            // Moderate time left - check every 2 minutes
            nextCheckInterval = 2 * 60 * 1000;
          } else {
            // Normal operation - check every 5 minutes
            nextCheckInterval = 5 * 60 * 1000;
          }

          scheduleNextCheck(nextCheckInterval);
        } else {
          setAuthenticated(false);
          setUser("");
          // Don't schedule next check if not authenticated
        }
      } catch (error) {
        console.warn("Session check failed:", error);
        setAuthenticated(false);
        setUser("");

        // On error, retry in 1 minute
        scheduleNextCheck(60 * 1000);
      }
    };

    // Check immediately on mount
    checkSession();

    // Janela volta da bandeja/minimizada: o WebView pode ter pausado os timers,
    // então confere já em vez de mostrar a tela admin com a sessão vencida.
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkSession();
    };
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      if (currentInterval) {
        clearTimeout(currentInterval);
      }
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [enabled]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const sessionInfo = await invoke<SessionInfo>("login", { username, password });
      setAuthenticated(true);
      setUser(sessionInfo.user);
      return true;
    } catch (error) {
      console.warn("Login failed:", error);
      setAuthenticated(false);
      setUser("");
      // Só credencial errada vira `false` ("Senha incorreta"). Bloqueio por
      // tentativas (RATE_LIMITED) ou falha ao falar com o AD sobem como erro
      // para o técnico ver o motivo real.
      const code = (error as { code?: unknown } | null)?.code;
      if (typeof code === "string" && code !== "INVALID_CREDENTIALS") throw error;
      return false;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await invoke("logout");
    } catch (error) {
      console.warn("Logout command failed:", error);
    }

    // Always update frontend state
    setAuthenticated(false);
    setUser("");
  }, []);

  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      await invoke("refresh_session");
    } catch (error) {
      console.warn("Session refresh failed:", error);
      // If refresh fails, check session status
      const session = await invoke<SessionInfo | null>("get_session").catch(() => null);
      if (!session) {
        setAuthenticated(false);
        setUser("");
      }
    }
  }, []);

  return {
    authenticated,
    user,
    login,
    logout,
    refreshSession,
  };
}
