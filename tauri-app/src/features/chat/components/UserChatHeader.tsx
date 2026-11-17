import { useState } from "react";
import { Minus } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface TechnicianInfo {
  name: string;
  avatar?: string;
  role: string;
  department?: string;
}

interface UserChatHeaderProps {
  technicianInfo: TechnicianInfo;
  status: { dotClass: string; label: string };
  onHide: () => void;
}

const currentWindow = getCurrentWindow();

/** Cabeçalho da janela do usuário: identifica o técnico que está atendendo. */
export function UserChatHeader({
  technicianInfo,
  status,
  onHide,
}: UserChatHeaderProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const initial = technicianInfo.name.trim().charAt(0).toUpperCase() || "T";

  return (
    <div
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        void currentWindow.startDragging().catch(() => {});
      }}
      className="border-b border-accent/20 bg-gradient-to-r from-accent/10 to-accent/10 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {technicianInfo.avatar && !avatarFailed ? (
            <img
              src={technicianInfo.avatar}
              alt={`Avatar de ${technicianInfo.name}`}
              className="h-10 w-10 rounded-full border-2 border-accent/30 object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <div
              className="grid h-10 w-10 place-items-center rounded-full border-2 border-accent/30 bg-accent/15 text-sm font-semibold text-accent-soft"
              aria-label={`Inicial de ${technicianInfo.name}`}
            >
              {initial}
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
              Você está no chat com
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-bold text-ink-strong">{technicianInfo.name}</h2>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${status.dotClass}`}
              title={status.label}
              aria-label={status.label}
            />
            <span className="text-xs font-medium text-ink-muted">{status.label}</span>
          </div>
        </div>
        <div className="flex items-start">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onHide}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-ink-faint transition hover:bg-surface-raised hover:text-ink"
            title="Minimizar janela"
            aria-label="Minimizar janela"
          >
            <Minus size={16} /> Minimizar
          </button>
        </div>
      </div>
    </div>
  );
}
