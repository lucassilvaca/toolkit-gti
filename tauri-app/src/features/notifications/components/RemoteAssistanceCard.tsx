import { MonitorPlay, Monitor } from "lucide-react";
import { InfoBanner, PrimaryButton } from "../../../shared/components";
import { useTauriCommands } from "../../system/hooks/useTauriCommands";

export function RemoteAssistanceCard() {
  const { runMaintenance, isLoading } = useTauriCommands();

  return (
    <section aria-labelledby="remote-assistance-heading" className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex items-center gap-3 border-b border-line px-4 py-4 sm:px-5">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-tint text-accent-soft">
          <MonitorPlay size={16} />
        </span>
        <h2 id="remote-assistance-heading" className="text-base font-semibold text-ink-strong">Assistência Remota</h2>
      </header>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <InfoBanner
          icon={Monitor}
          title="Windows Remote Assistance"
          description="Conecte-se remotamente para ajudar um usuário. Ao abrir, selecione o IP ou hostname da máquina de destino na janela do Windows."
          variant="neutral"
        />

        <ul className="space-y-2 text-sm text-ink">
          {[
            <>Utiliza <code className="rounded bg-surface-overlay px-1 font-mono text-ink-strong">msra.exe</code> nativo do Windows</>,
            "Histórico de conexões anteriores disponível na janela",
            "Requer permissão do usuário remoto para aceitar",
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-soft/75" />
              {item}
            </li>
          ))}
        </ul>

        <PrimaryButton icon={MonitorPlay} onClick={() => runMaintenance("open_msra")} disabled={isLoading}>
          Abrir Assistência Remota
        </PrimaryButton>
      </div>
    </section>
  );
}
