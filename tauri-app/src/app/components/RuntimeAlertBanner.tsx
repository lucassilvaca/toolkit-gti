import { AlertTriangle, X } from "lucide-react";

/** Título e orientação por tipo de alerta (`kind` de src-tauri/src/events/alerts.rs). */
const ALERT_TEXT: Record<string, { title: string; hint: string; tone: "danger" | "warning" }> = {
  "ws-server-error": {
    title: "Chat indisponível",
    hint: "A porta pode estar em uso por outra instância do Toolkit. Feche a outra janela ou troque a porta em Configurações.",
    tone: "danger",
  },
  "firewall-error": {
    title: "Firewall não liberado para o chat",
    hint: "Outras máquinas podem não conseguir abrir o chat com esta. Reinstale pelo MSI ou rode scripts/firewall/CONFIGURAR-FIREWALL.bat como Administrador.",
    tone: "warning",
  },
  "firewall-warning": {
    title: "Firewall não verificado",
    hint: "O app não está como Administrador, então não conferiu a regra da porta do chat.",
    tone: "warning",
  },
  "pipe-error": {
    title: "Canal local de notificações indisponível",
    hint: "Pode haver outra instância do Toolkit aberta. Feche-a e reabra o app.",
    tone: "warning",
  },
};

const TONE_CLASS = {
  danger: "border-danger/30 bg-danger/10 text-danger",
  warning: "border-warning/30 bg-warning/10 text-warning",
} as const;

interface RuntimeAlertBannerProps {
  kind: string;
  message: string;
  onDismiss: () => void;
}

export function RuntimeAlertBanner({ kind, message, onDismiss }: RuntimeAlertBannerProps) {
  const text = ALERT_TEXT[kind] ?? { title: "Aviso do sistema", hint: "", tone: "warning" as const };
  return (
    <div role="alert" className={`flex shrink-0 items-start gap-3 border-b px-6 py-2.5 text-sm ${TONE_CLASS[text.tone]}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{text.title}</p>
        <p className="opacity-85 [overflow-wrap:anywhere]">
          {message} {text.hint}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="focus-ring shrink-0 rounded-md p-1 opacity-70 transition-colors hover:opacity-100"
        aria-label="Dispensar aviso"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
