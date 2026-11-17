import { type FormEvent } from "react";
import { UserSearch, Loader2, X, CornerDownLeft } from "lucide-react";
import { Input, PrimaryButton } from "../../../shared/components";
import type { OnlineUser, ScanProgress } from "../types";
import type { LookupSummary } from "../utils/lookupSummary";

const TONE_STYLES = {
  online: { dot: "bg-success", text: "text-success", ring: "border-success/25 bg-success/[0.06]" },
  offline: { dot: "bg-warning", text: "text-warning", ring: "border-warning/25 bg-warning/[0.06]" },
  none: { dot: "bg-ink-faint", text: "text-ink-muted", ring: "border-line bg-surface-raised" },
} as const;

/** Quantas máquinas oferecer como atalho quando o nome bate em mais de uma. */
const MAX_USE_SHORTCUTS = 3;

/**
 * "O usuário está online?" — o técnico digita o login (ex.: `joao.silva`) e o
 * Toolkit responde onde a pessoa está e se está conectada agora.
 *
 * Com `onUse`, cada máquina encontrada vira um atalho que joga o endereço no
 * fluxo de chamada — é assim que o card "Chamar Usuário para Chat" usa o painel.
 */
export function UserLookupPanel({
  name, onNameChange, onSearch, onClear, loading, progress, error, summary, matches, onUse,
}: {
  name: string;
  onNameChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
  loading: boolean;
  progress: ScanProgress | null;
  error: string | null;
  summary: LookupSummary | null;
  matches: OnlineUser[];
  onUse?: (user: OnlineUser) => void;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch();
  };

  const tone = summary ? TONE_STYLES[summary.tone] : null;
  const atalhos = onUse ? matches.slice(0, MAX_USE_SHORTCUTS) : [];

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-accent/20 bg-accent/[0.04] p-3">
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <UserSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-accent-soft" />
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="O usuário está online? Digite o login (ex.: joao.silva)..."
            className="pl-9"
            aria-label="Nome do usuário para verificar se está online"
          />
        </div>
        <PrimaryButton type="submit" icon={loading ? Loader2 : UserSearch} disabled={loading || !name.trim()}>
          {loading ? "Procurando..." : "Verificar"}
        </PrimaryButton>
        {summary && !loading && (
          <button
            type="button"
            onClick={onClear}
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-muted transition hover:bg-surface-overlay"
            title="Limpar o resultado da busca"
          >
            <X size={13} /> Limpar
          </button>
        )}
      </form>

      {loading && (
        <p className="text-[11px] text-ink-muted">
          {progress
            ? `Nenhum registro recente — varrendo a rede (${progress.done}/${progress.total} hosts)...`
            : "Conferindo onde esse usuário foi visto pela última vez..."}
        </p>
      )}

      {error && !loading && <p className="text-[11px] text-danger">{error}</p>}

      {summary && !loading && tone && (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${tone.ring}`}>
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={`text-sm font-medium ${tone.text}`}>{summary.headline}</span>
            <span className="text-[11px] text-ink-muted">{summary.detail}</span>
            {matches.length > 1 && (
              <span className="text-[11px] text-ink-faint">
                {matches.length} máquinas com esse nome.
              </span>
            )}

            {atalhos.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {atalhos.map((u) => (
                  <button
                    key={u.ip}
                    type="button"
                    onClick={() => onUse?.(u)}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-accent-soft/40 bg-surface/40 px-2.5 py-1 text-[11px] text-ink transition hover:border-accent-soft hover:text-accent-soft"
                    title={`Usar ${u.ip} no convite`}
                  >
                    <CornerDownLeft size={11} />
                    <span className="font-mono">{u.ip}</span>
                    {u.hostname && <span className="text-ink-faint">· {u.hostname}</span>}
                    {!u.online && <span className="text-warning">· offline</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
