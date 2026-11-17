import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { errorText } from "../utils/errorText";

/** Cache de módulo + dedupe de chamadas em voo, compartilhado entre instâncias do hook. */
export interface InvokeCache<T> {
  value: T | null;
  inflight: Promise<T> | null;
}

export function createInvokeCache<T>(): InvokeCache<T> {
  return { value: null, inflight: null };
}

export interface UseInvokeResourceOptions<T> {
  /** Comando Tauri a invocar (sem argumentos). */
  command: string;
  /** Valor inicial do estado `data`. */
  initialData: T;
  /** Valor devolvido por `refresh` quando o invoke falha. */
  fallback: T;
  /** Prefixo do `console.warn` em caso de falha. */
  warnMessage: string;
  enabled?: boolean;
  /** Estado inicial de `loading` (padrão: `enabled`). */
  initialLoading?: boolean;
  /** Com cache: um valor já obtido é reutilizado e chamadas simultâneas são deduplicadas. */
  cache?: InvokeCache<T>;
  /** Limpa `error` ao iniciar cada busca (padrão: só limpa no sucesso). */
  clearErrorOnStart?: boolean;
}

export function useInvokeResource<T>(options: UseInvokeResourceOptions<T>) {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T>(options.initialData);
  const [loading, setLoading] = useState(options.initialLoading ?? enabled);
  const [error, setError] = useState<string | null>(null);

  // Opções lidas via ref: `refresh` fica estável mesmo com literais novos a cada render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const refresh = useCallback(async (): Promise<T> => {
    const { command, fallback, warnMessage, cache, clearErrorOnStart } = optionsRef.current;

    if (cache?.value) {
      const cached = cache.value;
      setData(cached);
      setLoading(false);
      setError(null);
      return cached;
    }

    try {
      setLoading(true);
      if (clearErrorOnStart) setError(null);
      let request: Promise<T>;
      if (cache) {
        if (!cache.inflight) {
          cache.inflight = invoke<T>(command).finally(() => {
            cache.inflight = null;
          });
        }
        request = cache.inflight;
      } else {
        request = invoke<T>(command);
      }
      const info = await request;
      if (cache) cache.value = info;
      setData(info);
      setError(null);
      return info;
    } catch (err) {
      setError(errorText(err));
      console.warn(warnMessage, err);
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    refresh();
  }, [enabled, refresh]);

  return { data, loading, error, refresh };
}
