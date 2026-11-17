import { useEffect, useRef, useState } from "react";
import { X, Square, Terminal } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { ModalShell } from "./ModalShell";
import { DotsLoader } from "./Loaders";

interface TerminalModalProps {
  open: boolean;
  title: string;
  lines: string[];
  /** Saída chegando linha a linha (ping -t, DISM, SFC, GPUpdate) — pode ser parada. */
  isStreaming: boolean;
  /** Comando em execução (inclui os que só devolvem a saída no fim). */
  isRunning?: boolean;
  /** Erro do comando, quando falhou. */
  error?: string | null;
  onClose: () => void;
  onStop: () => void;
}

/** Segundos desde que `active` virou true; zera quando um novo comando começa. */
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    setSeconds(0);
    const started = Date.now();
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return seconds;
}

export function TerminalModal({
  open,
  title,
  lines,
  isStreaming,
  isRunning = false,
  error,
  onClose,
  onStop,
}: TerminalModalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const running = isRunning || isStreaming;
  const elapsed = useElapsedSeconds(open && running);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, error, open]);

  const status = running
    ? `Executando… ${elapsed}s`
    : error
      ? "Falhou"
      : `Concluído · ${lines.length} linha${lines.length !== 1 ? "s" : ""}`;

  return (
    <AnimatePresence>
      {open && (
        <ModalShell onClose={onClose} maxWidth="max-w-2xl">
          <div className="flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-card bg-surface shadow-lift">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-item bg-accent-tint text-accent-strong">
                  <Terminal size={16} aria-hidden />
                </span>
                <span className="truncate font-mono text-sm font-medium text-ink-strong">{title}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isStreaming && (
                  <button
                    type="button"
                    onClick={onStop}
                    className="focus-ring flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/15 active:scale-95"
                  >
                    <Square size={10} fill="currentColor" aria-hidden />
                    Parar
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar"
                  title="Fechar (Esc)"
                  className="focus-ring rounded-xl p-1.5 text-ink-muted transition-colors hover:bg-accent-tint hover:text-accent-strong"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Terminal body — escuro de propósito: leitura de saída de console */}
            <div
              className="h-72 overflow-y-auto bg-[#10201e] p-5 font-mono text-xs leading-5 text-[#e4f0ed]"
              role="log"
              aria-live="polite"
              aria-busy={running}
            >
              {lines.length === 0 && running && (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-[#a9bfba]">
                  <DotsLoader className="text-base" />
                  <span>
                    {isStreaming ? "Aguardando a primeira linha…" : "Executando — a saída aparece ao terminar."}
                  </span>
                </div>
              )}
              {lines.length === 0 && !running && !error && (
                <span className="italic text-[#a9bfba]">O comando terminou sem saída.</span>
              )}
              {lines.map((line, i) => (
                <div
                  key={i}
                  className={isStreaming && i === lines.length - 1 ? "text-[#9fe6c3]" : undefined}
                >
                  {line}
                </div>
              ))}
              {error && !running && (
                <div className="mt-2 whitespace-pre-wrap text-[#ffa3a3]">✗ {error}</div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center gap-2 border-t border-line px-5 py-3">
              <span
                className={`h-2 w-2 rounded-full ${
                  running ? "animate-pulse bg-accent" : error ? "bg-danger" : "bg-success"
                }`}
                aria-hidden
              />
              <span className="font-mono text-xs text-ink-muted">{status}</span>
            </div>
          </div>
        </ModalShell>
      )}
    </AnimatePresence>
  );
}
