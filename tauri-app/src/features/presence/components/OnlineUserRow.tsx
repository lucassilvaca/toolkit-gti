import { useState } from "react";
import { Monitor, MessageSquare, Loader2, Clock, History } from "lucide-react";
import type { OnlineUser } from "../types";
import { UserActionsMenu } from "./UserActionsMenu";
import { pingHost, openRemoteAssistance, copyText } from "../services/userActions";

function formatUptime(secs?: number | null): string {
  if (secs == null || secs <= 0) return "—";
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatRelative(epochSecs?: number | null): string {
  if (epochSecs == null) return "—";
  const diff = Math.floor(Date.now() / 1000) - epochSecs;
  if (diff < 45) return "agora";
  if (diff < 3600) return `há ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.round(diff / 3600)} h`;
  return `há ${Math.round(diff / 86400)} d`;
}

type PingState = { state: "idle" | "loading" | "ok" | "fail"; output?: string };

export function OnlineUserRow({
  user, onCall, calling, onNotifyOk, onNotifyErr,
}: {
  user: OnlineUser;
  onCall: (u: OnlineUser) => void;
  calling: boolean;
  onNotifyOk: (msg: string) => void;
  onNotifyErr: (msg: string) => void;
}) {
  const [ping, setPing] = useState<PingState>({ state: "idle" });

  const target = user.ip;
  // Só máquinas com o Toolkit respondem o chat; sem ele, "Chamar" não funciona.
  const callable = user.has_toolkit !== false;

  const doPing = async () => {
    setPing({ state: "loading" });
    const r = await pingHost(target);
    // Erro do backend não é "sem resposta": a máquina nem foi testada.
    if (r.error) {
      setPing({ state: "idle" });
      onNotifyErr(`Não foi possível testar ${user.hostname || target}: ${r.error}`);
      return;
    }
    setPing({ state: r.ok ? "ok" : "fail", output: r.output });
    window.setTimeout(() => setPing({ state: "idle" }), 6000);
  };

  const doRemote = async () => {
    const r = await openRemoteAssistance(target);
    if (r.ok) onNotifyOk(r.message);
    else onNotifyErr(r.message);
  };

  const doCopy = async (text: string, label: string) => {
    const ok = await copyText(text);
    if (ok) onNotifyOk(`${label} copiado`);
    else onNotifyErr("Não foi possível copiar");
  };

  return (
    <tr className={`border-b border-line last:border-0 transition hover:bg-surface-overlay ${user.online ? "" : "opacity-60"}`}>
      <td className="px-4 py-2.5">
        <span className="inline-flex items-center gap-2 font-medium text-ink-strong">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${user.online ? "bg-success" : "bg-ink-faint"}`}
            title={user.online ? "Online" : "Offline (visto recentemente)"}
          />
          <Monitor size={14} className="text-ink-faint" />
          {user.hostname || user.ip}
          {user.has_toolkit === false && (
            <span
              className="rounded bg-surface-raised px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-faint"
              title="Máquina ligada sem o chat do Toolkit (fechado ou porta do chat bloqueada)."
            >
              sem toolkit
            </span>
          )}
          {user.manual && (
            <span
              className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-soft"
              title="Adicionada manualmente por IP"
            >
              por IP
            </span>
          )}
        </span>
      </td>
      <td className="px-4 py-2.5 text-ink">{user.username || "—"}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-accent-soft">{user.ip}</td>
      <td className="px-4 py-2.5 text-ink-muted">
        {user.online ? (
          <span className="inline-flex items-center gap-1.5"><Clock size={12} className="text-ink-faint" />{formatUptime(user.uptime_secs)}</span>
        ) : "—"}
      </td>
      <td className="px-4 py-2.5 text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><History size={12} className="text-ink-faint" />{user.online ? "agora" : formatRelative(user.last_seen)}</span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-2">
          {ping.state !== "idle" && (
            <span
              title={ping.output || ""}
              className={`text-[11px] ${ping.state === "ok" ? "text-success" : ping.state === "fail" ? "text-danger" : "text-ink-muted"}`}
            >
              {ping.state === "loading" ? "testando…" : ping.state === "ok" ? "✓ respondeu" : "✗ sem resposta"}
            </span>
          )}
          <button
            type="button"
            onClick={() => onCall(user)}
            disabled={calling || !callable}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white shadow shadow-accent/30 transition hover:bg-accent-soft active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            title={callable ? `Chamar ${user.hostname || user.ip} para o chat` : "Máquina ligada sem o Toolkit — não é possível chamar"}
          >
            {calling ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
            Chamar
          </button>
          <UserActionsMenu
            ariaLabel={`Ações para ${user.hostname || user.ip}`}
            items={[
              { label: "Acesso remoto", onSelect: () => void doRemote() },
              { label: "Testar conexão (ping)", onSelect: () => void doPing() },
              { label: "Copiar IP", onSelect: () => void doCopy(user.ip, "IP") },
              { label: "Copiar nome", onSelect: () => void doCopy(user.hostname || user.ip, "Nome") },
            ]}
          />
        </div>
      </td>
    </tr>
  );
}
