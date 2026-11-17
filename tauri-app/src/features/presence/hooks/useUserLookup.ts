import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { summarizeLookup, type LookupSummary } from "../utils/lookupSummary";
import type { ScanProgress, UserLookupResult } from "../types";
import { errorText } from "../../../shared/utils/errorText";

/** Busca de uma pessoa pelo login: "o joao.silva está online?". */
export function useUserLookup(localIp: string, chatPort: number, ipReady: boolean) {
  const [name, setName] = useState("");
  const [result, setResult] = useState<UserLookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A fase de varredura da busca emite progresso próprio, para não se misturar
  // com o da tabela de usuários online.
  useEffect(() => {
    const un = listen<ScanProgress>("presence-lookup-progress", (e) => setProgress(e.payload));
    return () => {
      void un.then((f) => f());
    };
  }, []);

  const search = useCallback(async () => {
    const alvo = name.trim();
    if (!alvo || loading) return;
    if (!ipReady) {
      setError("IP local ainda não disponível. Aguarde a coleta de rede.");
      return;
    }
    setLoading(true);
    setProgress(null);
    setError(null);
    try {
      const res = await invoke<UserLookupResult>("find_user_by_name", {
        name: alvo,
        baseIp: localIp,
        wsPort: chatPort,
      });
      setResult(res);
    } catch (e) {
      setResult(null);
      setError(errorText(e));
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [name, loading, ipReady, localIp, chatPort]);

  const clearSearch = useCallback(() => {
    setName("");
    setResult(null);
    setError(null);
  }, []);

  const summary: LookupSummary | null = useMemo(
    () => (result ? summarizeLookup(result) : null),
    [result],
  );

  return {
    name,
    setName,
    search,
    clearSearch,
    loading,
    progress,
    error,
    result,
    summary,
    matches: result?.matches ?? [],
  };
}
