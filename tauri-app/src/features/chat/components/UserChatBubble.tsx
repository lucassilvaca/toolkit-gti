import { memo } from "react";
import {
  Paperclip,
  Download,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { isWsFileMessage } from "../../../shared/types/chat";
import type { WsChatMessage } from "../../../shared/types/chat";
import { formatChatTime } from "../../../shared/utils/datetime";

interface UserChatBubbleProps {
  msg: WsChatMessage;
  savingFile: string | null;
  onSaveFile: (fileName: string, fileData: string) => void;
  onRetry?: (messageId: string) => void;
}

/** Bolha de mensagem da janela do usuário (com ticks de status e retry). */
function UserChatBubbleImpl({ msg, savingFile, onSaveFile, onRetry }: UserChatBubbleProps) {
  const isOwn = msg.sender === "me";
  const ts = formatChatTime(msg.timestamp);

  return (
    <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[80%] min-w-0 rounded-[6px] px-4 py-2.5 ${
          isOwn ? "bg-accent text-white" : "bg-surface-raised text-ink"
        }`}
      >
        {isWsFileMessage(msg) ? (
          <div className="flex min-w-0 items-center gap-2">
            <Paperclip size={16} />
            <span className="min-w-0 text-sm break-words [overflow-wrap:anywhere]">
              {msg.filename}
            </span>
            {!isOwn && msg.file_data && (
              <button
                onClick={() => onSaveFile(msg.filename, msg.file_data)}
                disabled={savingFile === msg.filename}
                className="ml-2 rounded p-1 transition hover:bg-white/20"
              >
                {savingFile === msg.filename ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Download size={14} />
                )}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm leading-relaxed break-words [overflow-wrap:anywhere]">
            {msg.content}
          </p>
        )}
      </div>
      <div className={`mt-1 flex items-center gap-1.5 ${isOwn ? "flex-row-reverse" : ""}`}>
        <span className="text-[10px] text-line">{ts}</span>
        {isOwn && msg.status && msg.status !== "failed" && (
          msg.status === "sending" ? <Clock size={12} className="text-ink-faint" aria-label="enviando" /> :
          msg.status === "sent" ? <Check size={13} className="text-ink-faint" aria-label="enviado" /> :
          msg.status === "delivered" ? <CheckCheck size={13} className="text-ink-faint" aria-label="entregue" /> :
          <CheckCheck size={13} className="text-accent-soft" aria-label="lido" />
        )}
        {isOwn && msg.status === "failed" && (
          <button
            type="button"
            onClick={() => onRetry?.(msg.id)}
            className="focus-ring flex items-center gap-1 rounded text-[10px] font-medium text-danger hover:text-danger/80"
            title="Falha no envio — tentar novamente"
          >
            <AlertCircle size={12} />
            <RotateCcw size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

export const UserChatBubble = memo(UserChatBubbleImpl);
