import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, X, MessageSquare, ShieldCheck, Loader2 } from "lucide-react";
import { NetworkConfigService } from "../../settings/services/NetworkConfig";
import { sendReply } from "../../notifications/services/reply";
import { useAutoCloseCountdown } from "../../notifications/hooks/useAutoCloseCountdown";

const DECLINE_REASONS = ["Estou ocupado", "Retorne depois", "Não preciso de ajuda"] as const;
type DeclineReason = (typeof DECLINE_REASONS)[number];

// URLSearchParams.get já devolve o valor decodificado; decodificar de novo
// lança URIError em mensagens com "%" (ex.: "50%").
function getInviteFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return {
    admin_name: p.get("name")  ?? "Tecnico",
    admin_host: p.get("host")  ?? "GTI",
    admin_ip:   p.get("ip")    ?? "",
    message:    p.get("msg")   ?? "",
    duration:   parseInt(p.get("dur")     ?? "30",   10),
    room_id:    p.get("room")  ?? "",
    ws_port:    parseInt(p.get("ws_port") ?? String(NetworkConfigService.getDefaultPort()), 10),
    token:      p.get("token") ?? "",
  };
}

export function ChatInviteView() {
  const data = getInviteFromUrl();
  const [accepted, setAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [choosingDeclineReason, setChoosingDeclineReason] = useState(false);
  const { progress, stop: stopCountdown } = useAutoCloseCountdown(data.duration);

  const handleAccept = async () => {
    stopCountdown();
    setAccepted(true);
    void sendReply({
      technicianHost: data.admin_host,
      technicianIp: data.admin_ip,
      wsPort: data.ws_port,
      replyMessage: "Aceitou o atendimento.",
    }).catch((error: unknown) => console.error("send acceptance reply:", error));
    const wsHost = `${data.admin_ip}:${data.ws_port}`;
    invoke("open_user_chat", {
      roomId:    data.room_id,
      wsHost,
      adminName: data.admin_name,
      token:     data.token,
    }).catch((e) => {
      console.error("open_user_chat:", e);
    });
    setTimeout(() => { getCurrentWindow().close().catch(() => {}); }, 900);
  };

  const handleDecline = async (reason: DeclineReason) => {
    stopCountdown();
    setDeclined(true);
    try {
      await sendReply({
        technicianHost: data.admin_host,
        technicianIp: data.admin_ip,
        wsPort: data.ws_port,
        replyMessage: `Recusou o atendimento: ${reason}.`,
      });
    } catch (error) {
      // A confirmação visual local não deve ficar presa se a rede cair.
      console.error("send decline reply:", error);
    }
    setTimeout(() => { getCurrentWindow().close().catch(() => {}); }, 400);
  };

  const initial = data.admin_name.trim().charAt(0).toUpperCase() || "G";

  return (
    <div
      className="relative flex h-full w-full select-none flex-col overflow-hidden border border-line bg-base font-sans text-ink shadow-lift"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3" data-tauri-drag-region>
        <div className="flex items-center gap-2.5" data-tauri-drag-region>
          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
            Solicitação de atendimento
          </span>
        </div>
        <button
          onClick={() => { getCurrentWindow().close().catch(() => {}); }}
          className="focus-ring rounded-md p-1 text-ink-faint transition hover:bg-surface-overlay hover:text-ink"
          aria-label="Fechar solicitação"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between px-5 py-5">
        {accepted ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full border border-success/30 bg-success/10 text-success">
              <Check className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-ink-strong">Atendimento aceito</p>
              <p className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-ink-faint">
                <Loader2 className="h-3 w-3 animate-spin" /> Abrindo o chat…
              </p>
            </div>
          </div>
        ) : declined ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full border border-line/60 bg-surface-raised text-ink-faint">
              <X className="h-6 w-6" />
            </div>
            <p className="text-[15px] font-semibold text-ink-faint">Solicitação recusada</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-accent/25 bg-accent/10 text-sm font-semibold text-accent-soft">
                {initial}
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5 text-xs text-ink-faint">
                  <ShieldCheck className="h-3.5 w-3.5 text-accent-soft" />
                  Suporte Técnico GTI
                </div>
                <p className="truncate font-display text-[19px] font-semibold leading-tight text-ink-strong">
                  {data.admin_name}
                </p>
                <p className="mt-1 text-xs text-ink-muted">está solicitando iniciar um atendimento</p>
              </div>
            </div>

            {data.message && (
              <div className="mt-4 max-h-20 overflow-y-auto border-l-2 border-accent/50 pl-3 text-[13px] leading-relaxed text-ink-muted [overflow-wrap:anywhere]">
                {data.message}
              </div>
            )}

            {choosingDeclineReason ? (
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-ink-muted">Por que deseja recusar?</p>
                <div className="grid grid-cols-2 gap-2">
                  {DECLINE_REASONS.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => void handleDecline(reason)}
                      className="focus-ring rounded-md border border-line/70 px-2 py-2 text-xs text-ink-muted transition hover:bg-surface-overlay hover:text-ink"
                    >
                      {reason}
                    </button>
                  ))}
                  <button
                    onClick={() => setChoosingDeclineReason(false)}
                    className="focus-ring rounded-md px-2 py-2 text-xs text-ink-faint transition hover:bg-surface-overlay hover:text-ink"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex w-full gap-2">
                <button
                  onClick={() => setChoosingDeclineReason(true)}
                  className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line/70 bg-transparent py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-overlay hover:text-ink active:scale-[0.98]"
                >
                  Recusar
                </button>
                <button
                  onClick={() => void handleAccept()}
                  className="focus-ring flex flex-[1.3] items-center justify-center gap-1.5 rounded-md bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-soft active:scale-[0.98]"
                >
                  <MessageSquare className="h-4 w-4" /> Aceitar
                </button>
              </div>
            )}

          </>
        )}
      </div>

      {!accepted && !declined && (
        <div
          className="h-1 bg-surface-raised"
          role="progressbar"
          aria-label="Tempo restante para responder"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className="h-full bg-accent transition-[width] duration-[50ms] ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
