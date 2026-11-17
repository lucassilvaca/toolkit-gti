import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const TICK_MS = 50;

/**
 * Barra de progresso regressiva que fecha a janela ao zerar.
 * `durationSec` nulo = inativo. `restartKey` reinicia a contagem quando muda.
 */
export function useAutoCloseCountdown(durationSec: number | null, restartKey?: unknown) {
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (durationSec === null) return;
    const steps = (durationSec * 1000) / TICK_MS;
    let step = 0;
    timerRef.current = setInterval(() => {
      step++;
      setProgress(Math.max(0, 100 - (step / steps) * 100));
      if (step >= steps) {
        clearInterval(timerRef.current!);
        getCurrentWindow().close().catch(() => {});
      }
    }, TICK_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [durationSec, restartKey]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  return { progress, stop };
}
