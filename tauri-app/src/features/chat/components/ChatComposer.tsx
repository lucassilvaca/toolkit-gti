import { useState } from "react";
import { Paperclip, Send } from "lucide-react";
import { Input, StatusAlert } from "../../../shared/components";
import type { WsConnectionStatus } from "../../../shared/types/chat";
import type { FileAlert } from "../hooks/useChatFiles";
import { TypingIndicator } from "./TypingIndicator";

interface ChatComposerProps {
  status: WsConnectionStatus;
  fileAlert: FileAlert;
  errorAlert: FileAlert;
  remoteTyping: boolean;
  remoteName: string;
  onAttach: () => void;
  onTyping?: () => void;
  /** Recebe o texto já aparado; não é chamado com status "disconnected". */
  onSend: (text: string) => void;
}

/** Rodapé do chat do técnico: "digitando", alertas, campo e envio. */
export function ChatComposer({
  status,
  fileAlert,
  errorAlert,
  remoteTyping,
  remoteName,
  onAttach,
  onTyping,
  onSend,
}: ChatComposerProps) {
  const [inputText, setInputText] = useState("");
  const connected = status === "connected" || status === "idle";

  const handleSend = () => {
    if (!inputText.trim() || status === "disconnected") return;
    onSend(inputText.trim());
    setInputText("");
  };

  return (
    <>
      {remoteTyping && connected && (
        <TypingIndicator
          name={remoteName}
          className="flex items-center gap-2 px-4 pb-1 text-[11px] text-ink-muted"
        />
      )}

      <div className="min-w-0 space-y-2 border-t border-line bg-surface px-4 py-3">
        <StatusAlert status={fileAlert} />
        <StatusAlert status={errorAlert} />
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onAttach}
            disabled={!connected}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border border-line/50 text-ink-faint transition hover:border-accent/40 hover:text-accent-soft active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            title="Enviar arquivo (max 10MB)"
          >
            <Paperclip size={16} />
          </button>

          <Input
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              if (e.target.value) onTyping?.();
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={!connected}
            placeholder={connected ? "Digite uma mensagem..." : "Aguardando conexão..."}
            className="min-w-0"
          />

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || !connected}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-accent text-white transition hover:bg-accent-soft active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            title="Enviar (Enter)"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
