import { useState } from "react";
import { Paperclip, Send } from "lucide-react";
import type { FileAlert } from "../hooks/useChatFiles";
import { TypingIndicator } from "./TypingIndicator";

interface UserChatComposerProps {
  connected: boolean;
  fileAlert: FileAlert;
  remoteTyping: boolean;
  technicianName: string;
  onAttach: () => void;
  onTyping: () => void;
  /** Recebe o texto já aparado; só é chamado com conexão ativa. */
  onSend: (text: string) => void;
}

/** Rodapé da janela do usuário: alertas, "digitando", campo e envio. */
export function UserChatComposer({
  connected,
  fileAlert,
  remoteTyping,
  technicianName,
  onAttach,
  onTyping,
  onSend,
}: UserChatComposerProps) {
  const [inputText, setInputText] = useState("");

  const handleSend = () => {
    if (!inputText.trim() || !connected) return;
    onSend(inputText.trim());
    setInputText("");
  };

  return (
    <div className="flex-none space-y-2 border-t border-surface-raised/50 bg-surface/50 p-3">
      {fileAlert && (
        <div
          className={`flex items-center gap-2 rounded-[6px] border px-3 py-2 text-xs font-medium ${
            fileAlert.ok
              ? "border-success/20 bg-success/10 text-success"
              : "border-danger/20 bg-danger/10 text-danger"
          }`}
        >
          <span>{fileAlert.ok ? "OK" : "ERRO"}</span>
          {fileAlert.msg}
        </div>
      )}
      {remoteTyping && connected && (
        <TypingIndicator
          name={technicianName}
          className="mb-1 flex items-center gap-2 px-1 text-[11px] text-ink-muted"
        />
      )}
      <div
        className={`flex items-center gap-2 rounded-[6px] border px-3 py-2 ${
          connected ? "border-line/50 bg-surface-raised/50" : "border-surface-raised/30 bg-surface/30"
        }`}
      >
        <button
          onClick={onAttach}
          disabled={!connected}
          className="focus-ring rounded-lg p-2 text-ink-faint transition hover:bg-line hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Paperclip size={18} />
        </button>
        <input
          type="text"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            if (e.target.value) onTyping();
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={!connected}
          placeholder={connected ? "Digite uma mensagem..." : "Aguardando conexão..."}
          className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint disabled:opacity-40"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || !connected}
          className="focus-ring rounded-lg bg-accent p-2 text-white transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </div>
      <p className="mt-2 text-center text-[10px] text-line">
        Conversa segura via WebSocket • Suporte Tecnico GTI
      </p>
    </div>
  );
}
