import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { errorText } from "../../../shared/utils/errorText";
import { sendReply } from "../services/reply";
import { useAutoCloseCountdown } from "../hooks/useAutoCloseCountdown";

interface NotificationData {
  admin_name: string;
  admin_host: string;
  admin_ip?: string;
  ws_port?: number;
  message: string;
  duration: number;
}

function normalizeReplyError(error: unknown): string {
  const message = errorText(error);

  if (message.includes("/reply")) {
    return "Não foi possível devolver a resposta direto para o técnico. Verifique se o app dele ainda está aberto.";
  }
  if (message.includes("Named Pipe") || message.includes("via rede")) {
    return "Não foi possível entregar a resposta. Tente novamente em alguns segundos.";
  }
  if (message.includes("Acesso negado") || message.includes("Access is denied")) {
    return "A rede bloqueou o envio da resposta. Tente novamente ou avise o técnico por outro canal.";
  }

  return message;
}

export function PopupNotificationView() {
  const [data, setData]           = useState<NotificationData | null>(null);
  const [reply, setReply]         = useState("");
  const [replySent, setReplySent] = useState(false);
  const [replyError, setReplyError] = useState("");

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) {
      setData({
        admin_name: "joao.silva",
        admin_host: "PC-GTI-01",
        admin_ip: "192.168.0.10",
        ws_port: 7890,
        message: "Por favor reinicie sua máquina para aplicar as atualizações pendentes.",
        duration: 8,
      });
      return;
    }
    const unlisten = listen<NotificationData>("notification-data", (e) => setData(e.payload));
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // `data` como chave: um novo payload reinicia a contagem.
  const { progress, stop: stopCountdown } = useAutoCloseCountdown(data ? data.duration : null, data);

  const handleReply = async () => {
    if (!data || !reply.trim()) return;
    setReplyError("");
    try {
      await sendReply({
        technicianHost: data.admin_host,
        technicianIp: data.admin_ip,
        wsPort: data.ws_port,
        replyMessage: reply.trim(),
      });
      setReplySent(true);
      stopCountdown();
      setTimeout(() => getCurrentWindow().close(), 1500);
    } catch (e) {
      setReplyError(normalizeReplyError(e));
    }
  };

  if (!data) return <div className="h-full w-full bg-base" />;

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-[10px] border border-accent/30 bg-base font-sans">

      {/* Header */}
      <div
        data-tauri-drag-region
        className="flex cursor-move items-center gap-2 border-b border-accent/20 bg-accent/10 px-3.5 py-2.5"
      >
        <span className="text-base">🔔</span>
        <span className="text-[13px] font-bold text-ink">Notificação do Técnico GTI</span>
        <button
          onClick={() => getCurrentWindow().close()}
          className="ml-auto px-0.5 text-base leading-none text-line hover:text-ink-muted"
        >✕</button>
      </div>

      {/* From */}
      <div className="px-3.5 pb-1 pt-2.5 text-xs text-ink-faint">
        De:{" "}
        <span className="font-bold text-accent-soft">{data.admin_name}</span>{" "}
        <span className="text-line">({data.admin_host})</span>
      </div>

      {/* Message */}
      <div className="mx-3.5 mb-2 mt-1 flex-1 overflow-y-auto rounded-lg border border-surface-raised/50 bg-surface/50 p-2.5 text-[13px] leading-snug text-ink break-words">
        {data.message}
      </div>

      {/* Reply area */}
      {replySent ? (
        <p className="pb-2.5 text-center text-xs font-semibold text-success">✓ Resposta enviada com sucesso!</p>
      ) : (
        <div className="px-3.5 pb-2.5">
          {replyError && <p className="mb-1 text-[11px] text-danger">{replyError}</p>}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReply()}
              placeholder="Digite uma resposta..."
              className="flex-1 rounded-md border border-surface-raised/50 bg-surface/50 px-2.5 py-1.5 text-xs text-ink outline-none placeholder:text-line focus:border-accent/40"
            />
            <button
              onClick={handleReply}
              disabled={!reply.trim()}
              className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-line"
            >
              Responder
            </button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-[3px] shrink-0 bg-surface-raised">
        <div
          className="h-full bg-accent transition-[width] duration-[50ms] linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
