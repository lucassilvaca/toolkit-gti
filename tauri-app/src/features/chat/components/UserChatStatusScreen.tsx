import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, WifiOff } from "lucide-react";
import { DotsLoader, PageShell } from "../../../shared/components";

const currentWindow = getCurrentWindow();

type UserChatStatusScreenProps =
  | { kind: "ended" }
  | { kind: "error"; message: string }
  | { kind: "waiting" };

/** Telas de estado da janela do usuário: encerrado, erro de init e aguardando. */
export function UserChatStatusScreen(props: UserChatStatusScreenProps) {
  return (
    <PageShell variant="singleColumn" maxWidthClassName="w-full" className="h-full">
      {props.kind === "ended" ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-base p-8 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-accent/15 text-accent-soft ring-1 ring-accent-soft/30">
            <Check className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-strong">Atendimento encerrado</p>
            <p className="mt-1 text-xs text-ink-faint">
              O técnico finalizou o chat. Esta janela vai fechar.
            </p>
          </div>
        </div>
      ) : props.kind === "error" ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-base p-8 text-center text-ink-muted">
          <WifiOff size={28} className="text-danger" />
          <p className="text-sm">{props.message}</p>
          <button
            onClick={() => currentWindow.destroy().catch(() => {})}
            className="rounded-[6px] bg-surface-raised px-4 py-2 text-sm text-ink hover:bg-line"
          >
            Fechar
          </button>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-base text-ink-muted">
          <DotsLoader className="text-lg" />
          <p className="text-sm">Aguardando dados da sessão...</p>
        </div>
      )}
    </PageShell>
  );
}
