import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { PrimaryButton, StatusAlert, WindowTopbar } from "../../shared/components";
import { safeInvoke } from "../../shared/services/tauri";
import { isTauriWebview } from "../../shared/utils/tauri-runtime";

/**
 * Instância sem privilégio de administrador. No PC do usuário final é o
 * estado normal: o app roda só para a bandeja e o chat, e esta tela só aparece
 * se alguém abrir o dashboard. O técnico reabre o app elevado (UAC) pelo botão.
 */
export function RequiresAdminView() {
  const [elevating, setElevating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inTauri = isTauriWebview();

  const handleElevate = async () => {
    setElevating(true);
    setError(null);
    // Sucesso encerra esta instância; só volta aqui se o UAC foi cancelado ou falhou.
    const result = await safeInvoke<null>("relaunch_as_admin");
    if (!result.ok) {
      setError(result.error);
    }
    setElevating(false);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base">
      <WindowTopbar subtitle="Permissões" />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="max-w-lg space-y-4">
          <h1 className="text-xl font-semibold text-ink-strong">Área restrita à equipe GTI</h1>
          <p className="text-sm leading-relaxed text-ink">
            As ferramentas do Toolkit exigem credencial de administrador. O chat com a equipe GTI continua
            funcionando pelo ícone na bandeja.
          </p>

          {inTauri ? (
            <div className="flex flex-col items-center gap-3">
              <PrimaryButton
                type="button"
                icon={ShieldCheck}
                loading={elevating}
                loadingText="Aguardando confirmação..."
                onClick={() => void handleElevate()}
              >
                Abrir como administrador
              </PrimaryButton>
              <StatusAlert status={error ? { ok: false, msg: error } : null} />
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-ink-muted">
              Aberto pelo navegador (<code className="rounded bg-accent-tint px-1">localhost</code>): o modo web
              não tem acesso ao Windows. Use o app desktop com{" "}
              <code className="rounded bg-accent-tint px-1">npm run tauri dev</code>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
