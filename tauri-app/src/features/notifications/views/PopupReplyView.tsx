import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface ReplyData {
  user_name: string;
  user_host: string;
  reply_message: string;
}

export function PopupReplyView() {
  const [data, setData] = useState<ReplyData | null>(null);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) {
      setData({ user_name: "maria.souza", user_host: "PC-RH-04", reply_message: "Ok! Vou reiniciar agora." });
      return;
    }
    const unlisten = listen<ReplyData>("reply-data", (e) => setData(e.payload));
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  if (!data) return <div className="h-full w-full bg-base" />;

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden rounded-[10px] border border-success/30 bg-base font-sans">

      {/* Header */}
      <div
        data-tauri-drag-region
        className="flex cursor-move items-center gap-2 border-b border-success/20 bg-success/10 px-3.5 py-2.5"
      >
        <span className="text-base">💬</span>
        <span className="text-[13px] font-bold text-ink">Resposta do Usuário</span>
        <button
          onClick={() => getCurrentWindow().close()}
          className="ml-auto px-0.5 text-base leading-none text-line hover:text-ink-muted"
        >✕</button>
      </div>

      {/* From */}
      <div className="px-3.5 pb-1 pt-2.5 text-xs text-ink-faint">
        De:{" "}
        <span className="font-bold text-success">{data.user_name}</span>{" "}
        <span className="text-line">({data.user_host})</span>
      </div>

      {/* Reply message */}
      <div className="mx-3.5 mb-3.5 mt-1 flex-1 overflow-y-auto rounded-lg border border-surface-raised/50 bg-surface/50 p-2.5 text-[13px] leading-snug text-ink break-words">
        {data.reply_message}
      </div>

      {/* Close button */}
      <div className="flex justify-end px-3.5 pb-3">
        <button
          onClick={() => getCurrentWindow().close()}
          className="rounded-md border border-line/50 bg-surface-raised/50 px-4 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-line/50 hover:text-ink"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
