import {
  Activity,
  Check,
  Clipboard,
  Clock3,
  Loader2,
  MonitorUp,
  Paperclip,
  ShieldCheck,
  ShieldX,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import type { WsConnectionStatus, WsPresenceState } from "../../../shared/types/chat";
import { copyText, openRemoteAssistance } from "../../presence/services/userActions";
import type { ChatSessionTarget } from "../hooks/useChatSessions";

interface Props {
  target?: ChatSessionTarget;
  remoteName: string;
  remotePresence: WsPresenceState;
  status: WsConnectionStatus;
  onAttachFile: () => void;
  onEndSession?: () => void;
}

type ActionNotice = { ok: boolean; message: string } | null;

function formatUptime(seconds?: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

function formatLastSeen(epochSeconds?: number | null): string {
  if (epochSeconds == null) return "Agora";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds);
  if (seconds < 45) return "Agora";
  if (seconds < 3600) return `Há ${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `Há ${Math.round(seconds / 3600)} h`;
  return `Há ${Math.round(seconds / 86400)} d`;
}

function sessionState(status: WsConnectionStatus, presence: WsPresenceState) {
  if (status === "disconnected" || presence === "offline") {
    return { label: "Sem conexão", tone: "bg-danger", icon: WifiOff };
  }
  if (status === "connecting" || presence === "unknown") {
    return { label: "Conectando", tone: "bg-warning", icon: Activity };
  }
  if (presence === "away") {
    return { label: "Ausente", tone: "bg-warning", icon: Clock3 };
  }
  return { label: "No chat", tone: "bg-success", icon: Wifi };
}

/**
 * Contexto operacional da conversa. Só mostra dados confirmados pela sessão ou
 * por ações locais do técnico; não simula telemetria que o destino não enviou.
 */
export function TechnicianSessionPanel({ target, remoteName, remotePresence, status, onAttachFile, onEndSession }: Props) {
  const [openingRemote, setOpeningRemote] = useState(false);
  const [notice, setNotice] = useState<ActionNotice>(null);
  const address = target?.address?.trim();
  const session = sessionState(status, remotePresence);
  const SessionIcon = session.icon;
  const uptime = formatUptime(target?.uptimeSeconds);

  const startRemoteAssistance = async () => {
    if (!address || openingRemote) return;
    setOpeningRemote(true);
    setNotice(null);
    const result = await openRemoteAssistance(address);
    setNotice({ ok: result.ok, message: result.message });
    setOpeningRemote(false);
  };

  const copyAddress = async () => {
    if (!address) return;
    const copied = await copyText(address);
    setNotice(copied ? { ok: true, message: "Endereço copiado" } : { ok: false, message: "Não foi possível copiar o endereço" });
  };

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-accent-soft" />
          <h2 className="text-sm font-semibold text-ink-strong">Painel de atendimento</h2>
        </div>
        <p className="mt-1 text-[11px] text-ink-faint">Sessão e ações da máquina atendida</p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <section aria-labelledby="session-status-title">
          <p id="session-status-title" className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Sessão</p>
          <div className="mt-2 space-y-2.5">
            <div className="flex items-center gap-2 text-xs text-ink">
              <span className={`h-2 w-2 rounded-full ${session.tone}`} />
              <SessionIcon size={14} className="text-ink-muted" />
              <span>{session.label}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink">
              <UserRound size={14} className="text-ink-muted" />
              <span className="min-w-0 truncate" title={remoteName}>{remoteName}</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="machine-title" className="border-t border-line pt-4">
          <p id="machine-title" className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Máquina</p>
          <dl className="mt-2.5 space-y-2.5 text-xs">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-ink-faint">Host</dt>
              <dd className="min-w-0 truncate text-right font-medium text-ink" title={target?.hostname || address}>{target?.hostname || "Não informado"}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-ink-faint">Endereço</dt>
              <dd className="min-w-0 truncate text-right font-mono text-[11px] text-accent-soft" title={address}>{address || "Não informado"}</dd>
            </div>
            {target?.username && (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-ink-faint">Conta</dt>
                <dd className="min-w-0 truncate text-right text-ink" title={target.username}>{target.username}</dd>
              </div>
            )}
            {uptime && (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-ink-faint">Ligada há</dt>
                <dd className="text-right text-ink">{uptime}</dd>
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <dt className="text-ink-faint">Visto</dt>
              <dd className="text-right text-ink">{formatLastSeen(target?.lastSeen)}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-ink-faint">Toolkit</dt>
              <dd className={`inline-flex items-center gap-1.5 text-right ${target?.hasToolkit === true ? "text-success" : target?.hasToolkit === false ? "text-warning" : "text-ink-muted"}`}>
                {target?.hasToolkit === true ? <ShieldCheck size={13} /> : <ShieldX size={13} />}
                {target?.hasToolkit === true ? "Disponível" : target?.hasToolkit === false ? "Não detectado" : "Sem dados"}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="actions-title" className="border-t border-line pt-4">
          <p id="actions-title" className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Ações permitidas</p>
          <div className="mt-2.5 grid gap-2">
            <button
              type="button"
              onClick={() => void startRemoteAssistance()}
              disabled={!address || openingRemote}
              className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-xs font-medium text-white transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {openingRemote ? <Loader2 size={14} className="animate-spin" /> : <MonitorUp size={14} />}
              Acesso remoto
            </button>
            <button
              type="button"
              onClick={onAttachFile}
              className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line/60 px-3 text-xs font-medium text-ink transition hover:border-accent/40 hover:bg-surface-overlay"
            >
              <Paperclip size={14} /> Enviar arquivo
            </button>
            <button
              type="button"
              onClick={() => void copyAddress()}
              disabled={!address}
              className="focus-ring inline-flex h-8 items-center justify-center gap-2 rounded-md text-xs text-ink-muted transition hover:bg-surface-overlay hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Clipboard size={13} /> Copiar endereço
            </button>
            {onEndSession && (
              <button
                type="button"
                onClick={onEndSession}
                className="focus-ring inline-flex h-8 items-center justify-center gap-2 rounded-md text-xs text-danger transition hover:bg-danger/10"
              >
                Encerrar atendimento
              </button>
            )}
          </div>
          {notice && (
            <p className={`mt-2 flex items-center gap-1.5 text-[11px] ${notice.ok ? "text-success" : "text-danger"}`}>
              {notice.ok && <Check size={13} />}
              {notice.message}
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}
