import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { isTauriWebview } from "../utils/tauri-runtime";

interface WindowTopbarProps {
  title?: string;
  subtitle?: string;
}

function runWindowAction(action: "minimize" | "toggleMaximize" | "close"): void {
  if (!isTauriWebview()) {
    return;
  }
  try {
    const win = getCurrentWindow();
    if (action === "minimize") {
      void win.minimize().catch(() => {});
    } else if (action === "toggleMaximize") {
      void win.toggleMaximize().catch(() => {});
    } else {
      void win.close().catch(() => {});
    }
  } catch {
    /* Chrome / dev sem shell Tauri */
  }
}

/** Acompanha o estado maximizado (botão, duplo clique na barra ou Win+Seta). */
function useIsMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriWebview()) {
      return;
    }
    let active = true;
    let unlisten: (() => void) | undefined;
    try {
      const win = getCurrentWindow();
      const sync = () => {
        win
          .isMaximized()
          .then((value) => {
            if (active) setMaximized(value);
          })
          .catch(() => {});
      };
      sync();
      win
        .onResized(sync)
        .then((fn) => {
          if (active) unlisten = fn;
          else fn();
        })
        .catch(() => {});
    } catch {
      /* Chrome / dev sem shell Tauri */
    }
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return maximized;
}

/**
 * Barra de título minimalista: região de arrastar + controles da janela.
 * A identidade visual (logo + nome) vive uma única vez, no topo da sidebar —
 * evita o logo/título duplicado entre topbar e sidebar.
 */
export function WindowTopbar({ subtitle }: WindowTopbarProps) {
  const maximized = useIsMaximized();

  return (
    <header className="relative z-40 flex h-10 shrink-0 items-center justify-end border-b border-line bg-base">
      <div data-tauri-drag-region className="absolute inset-0 select-none" />

      {subtitle ? (
        <div
          data-tauri-drag-region
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 select-none truncate text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint"
        >
          {subtitle}
        </div>
      ) : null}

      <div className="relative flex items-stretch self-stretch">
        <button
          type="button"
          onClick={() => runWindowAction("minimize")}
          className="flex w-11 items-center justify-center text-ink-muted transition-colors duration-130 ease-snap hover:bg-surface-overlay hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label="Minimizar janela"
          title="Minimizar"
        >
          <Minus className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => runWindowAction("toggleMaximize")}
          className="flex w-11 items-center justify-center text-ink-muted transition-colors duration-130 ease-snap hover:bg-surface-overlay hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label={maximized ? "Restaurar janela" : "Maximizar janela"}
          title={maximized ? "Restaurar" : "Maximizar"}
        >
          {maximized ? <Copy className="h-3.5 w-3.5 -scale-x-100" /> : <Square className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => runWindowAction("close")}
          className="flex w-11 items-center justify-center text-ink-muted transition-colors duration-130 ease-snap hover:bg-danger/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label="Fechar janela"
          title="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
