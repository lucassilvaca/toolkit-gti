import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { WindowTopbar } from "./WindowTopbar";

interface Props {
  children: ReactNode;
  /** Rótulo da área protegida — exibido no fallback (ex.: "Configurações"). */
  label?: string;
  /** Quando true, renderiza só o cartão (sem WindowTopbar) — para boundaries por-view. */
  compact?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * Captura erros de render/lifecycle da subárvore e exibe um fallback escuro
 * em vez de derrubar a janela inteira para uma tela branca.
 *
 * Uso:
 *  - Global: envolver <App/> e <UserChatView/> em main.tsx.
 *  - Por-view: envolver cada aba com compact para isolar a falha.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`,
      error,
      info.componentStack,
    );
  }

  private reset = (): void => {
    this.state.error && this.setState({ error: null });
  };

  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const card = (
      <div className="premium-card mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl px-8 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10">
          <AlertTriangle className="h-6 w-6 text-danger" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-ink-strong">
            Algo deu errado{this.props.label ? ` em ${this.props.label}` : ""}
          </h2>
          <p className="text-sm leading-6 text-ink-muted">
            Uma falha inesperada interrompeu esta tela. Você pode tentar
            novamente ou recarregar o aplicativo.
          </p>
        </div>
        <p className="w-full truncate rounded-xl border border-line/15 bg-base/50 px-3 py-2 font-mono text-xs text-ink-faint">
          {error.message || "Erro desconhecido"}
        </p>
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={this.reset}
            className="btn-ghost text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:scale-[0.98]"
          >
            <RotateCcw size={14} />
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={this.reload}
            className="btn-accent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:scale-[0.98]"
          >
            <RefreshCw size={14} />
            Recarregar
          </button>
        </div>
      </div>
    );

    if (this.props.compact) {
      return <div className="flex h-full items-center justify-center p-6">{card}</div>;
    }

    return (
      <div className="flex h-screen flex-col overflow-hidden bg-base">
        <WindowTopbar subtitle="Erro" />
        <div className="flex flex-1 items-center justify-center p-6">{card}</div>
      </div>
    );
  }
}
