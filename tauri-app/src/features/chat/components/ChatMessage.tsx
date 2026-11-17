import { Paperclip, Download, Loader2, Trash2, MoreVertical, Check, CheckCheck, Clock, AlertCircle, RotateCcw } from "lucide-react";
import { useState, useRef, useEffect, memo } from "react";
import { isWsFileMessage } from "../../../shared/types/chat";
import type { WsChatMessage, WsMessageStatus } from "../../../shared/types/chat";
import { formatChatTime as formatTs } from "../../../shared/utils/datetime";

interface Props {
  msg: WsChatMessage;
  savingFile: string | null;
  onSaveFile: (fileName: string, fileData: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  showDeleteOption?: boolean;
}

/** Ticks de status de uma mensagem própria (enviando → enviado → entregue → lido). */
function MessageStatusTicks({ status }: { status: WsMessageStatus }) {
  if (status === "sending") return <Clock size={12} className="text-accent-soft/60" aria-label="enviando" />;
  if (status === "sent") return <Check size={13} className="text-accent-soft/70" aria-label="enviado" />;
  if (status === "delivered") return <CheckCheck size={13} className="text-accent-soft/70" aria-label="entregue" />;
  if (status === "read") return <CheckCheck size={13} className="text-white" aria-label="lido" />;
  return null;
}

function ChatMessageBase({
  msg,
  savingFile,
  onSaveFile,
  onDeleteMessage,
  onRetry,
  showDeleteOption = true
}: Props) {
  const isOwn = msg.sender === "me";
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleDeleteMessage = () => {
    if (onDeleteMessage && msg.id) {
      onDeleteMessage(msg.id);
      setShowMenu(false);
    }
  };

  // Chat interno do técnico: "me" = técnico, "remote" = usuário atendido.
  const senderName = msg.senderInfo?.name || (isOwn ? "Você" : "Usuário");
  const senderRole = msg.senderInfo?.role || (isOwn ? "tech" : "user");
  const avatarLetter = senderName.charAt(0).toUpperCase();

  return (
    <div className={`group flex ${isOwn ? "justify-end" : "justify-start"} relative`}>
      {!isOwn && (
        <div className="mr-2 flex flex-col items-center gap-1">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            senderRole === 'tech'
              ? "bg-accent/20 text-accent-soft border border-accent/30"
              : "bg-surface-raised text-ink-muted"
          }`}>
            {avatarLetter}
          </div>
          {msg.senderInfo?.presence && (
            <div className={`w-2 h-2 rounded-full ${
              msg.senderInfo.presence === 'active' ? 'bg-success' :
              msg.senderInfo.presence === 'away' ? 'bg-warning' :
              msg.senderInfo.presence === 'offline' ? 'bg-danger' :
              'bg-ink-faint'
            }`} title={`Status: ${msg.senderInfo.presence}`} />
          )}
        </div>
      )}
      <div
        className={`max-w-[72%] min-w-0 rounded-2xl px-3.5 py-2.5 relative ${
          isOwn
            ? "bg-accent text-white rounded-br-md"
            : "bg-surface-raised text-ink rounded-bl-md border border-line"
        }`}
      >
        {/* Nome do remetente — só para mensagens recebidas */}
        {!isOwn && (
          <p className="mb-1 text-[11px] font-semibold text-accent-soft">
            {senderName}
          </p>
        )}
        {isWsFileMessage(msg) ? (
          <div className="flex min-w-0 items-center gap-2">
            <Paperclip size={13} className={isOwn ? "text-accent-soft" : "text-ink-muted"} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium break-words [overflow-wrap:anywhere]">
                {msg.filename}
              </p>
              <p className={`text-[10px] ${isOwn ? "text-accent-soft/70" : "text-ink-faint"}`}>
                {msg.mime_type}
              </p>
            </div>
            {!isOwn && msg.file_data && (
              <button
                onClick={() => onSaveFile(msg.filename, msg.file_data)}
                disabled={savingFile === msg.filename}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/20 text-accent-soft hover:bg-accent/30 transition disabled:opacity-50"
                title="Salvar arquivo"
              >
                {savingFile === msg.filename ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Download size={13} />
                )}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm leading-snug break-words [overflow-wrap:anywhere]">
            {msg.content}
          </p>
        )}

        <div className={`mt-1 flex items-center gap-1.5 ${isOwn ? "justify-end" : "justify-start"}`}>
          <span className={`text-[10px] ${isOwn ? "text-accent-soft/70" : "text-ink-faint"}`}>
            {formatTs(msg.timestamp)}
          </span>
          {isOwn && msg.status && msg.status !== "failed" && (
            <MessageStatusTicks status={msg.status} />
          )}
          {isOwn && msg.status === "failed" && (
            <button
              type="button"
              onClick={() => onRetry?.(msg.id)}
              className="focus-ring flex items-center gap-1 rounded text-[10px] font-medium text-white/90 hover:text-white"
              title="Falha no envio — tentar novamente"
            >
              <AlertCircle size={12} className="text-amber-200" />
              <RotateCcw size={11} />
            </button>
          )}
        </div>

        {/* Options Menu - Only show for own messages */}
        {isOwn && showDeleteOption && onDeleteMessage && (
          <div className="absolute -top-2 -right-2" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="opacity-60 group-hover:opacity-100 hover:opacity-100 transition-opacity p-1.5 rounded-md bg-surface text-ink-muted hover:text-ink-strong shadow-soft border border-line"
              title="Opções da mensagem"
            >
              <MoreVertical size={12} />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-surface border border-line rounded-lg shadow-lg py-1 min-w-[120px] z-50">
                <button
                  onClick={handleDeleteMessage}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-surface-raised transition-colors"
                >
                  <Trash2 size={12} />
                  Apagar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageBase);
