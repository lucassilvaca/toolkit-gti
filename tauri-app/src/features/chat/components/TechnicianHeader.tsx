import { Wifi, WifiOff, PhoneOff } from 'lucide-react';
import type { WsPresenceState } from '../../../shared/types/chat';

interface AttendedUserInfo {
  name: string;
  avatar?: string;
  role: string;
  department?: string;
}

interface TechnicianHeaderProps {
  /** Usuário Windows remoto em atendimento (tela do técnico). */
  attendedUser: AttendedUserInfo;
  /** Presença do usuário remoto na sala (active / away / offline). */
  remotePresence?: WsPresenceState;
  isConnected: boolean;
  compact?: boolean;
  /** Encerra o atendimento atual (técnico). Quando ausente, o botão não aparece. */
  onEndSession?: () => void;
}

function presenceToLabel(
  presence: WsPresenceState,
  isConnected: boolean,
): { dot: string; status: string } {
  if (!isConnected || presence === 'offline') {
    return { dot: 'bg-ink-faint', status: 'Offline' };
  }
  if (presence === 'away') {
    return { dot: 'bg-warning', status: 'Ausente' };
  }
  if (presence === 'active') {
    return { dot: 'bg-success', status: 'No chat' };
  }
  return { dot: 'bg-warning', status: 'Conectando…' };
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TechnicianHeader({
  attendedUser,
  remotePresence = 'unknown',
  isConnected,
  compact = false,
  onEndSession,
}: TechnicianHeaderProps) {
  const { dot, status } = presenceToLabel(remotePresence, isConnected);
  const initials = initialsOf(attendedUser.name);

  if (compact) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface/40 px-3 py-2">
        <div className="relative shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-accent/30 to-accent/[0.08] text-[10px] font-semibold text-accent-soft ring-1 ring-accent/25">
            {initials}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${dot} ring-2 ring-base`} />
        </div>
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{attendedUser.name}</p>
        {!isConnected && <WifiOff size={12} className="shrink-0 text-ink-faint" />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/40 px-4 py-3">
      <div className="relative shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-accent/30 to-accent/[0.08] text-sm font-semibold text-accent-soft shadow-none ring-1 ring-accent/25">
          {initials}
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ${dot} ring-2 ring-base`}
          title={status}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink-strong">
            {attendedUser.name}
          </p>
          <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-ink-muted">
            {attendedUser.role}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-faint">
          {status}
          {attendedUser.department ? ` · ${attendedUser.department}` : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            isConnected ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
          }`}
        >
          {isConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {isConnected ? 'Conectado' : 'Sem conexão'}
        </div>

        {onEndSession ? (
          <button
            type="button"
            onClick={onEndSession}
            className="flex items-center gap-1.5 rounded-full border border-danger/30 px-2.5 py-1 text-[11px] font-medium text-danger transition-colors duration-130 ease-snap hover:bg-danger/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            title="Encerrar atendimento"
          >
            <PhoneOff size={11} />
            Encerrar
          </button>
        ) : null}
      </div>
    </div>
  );
}
