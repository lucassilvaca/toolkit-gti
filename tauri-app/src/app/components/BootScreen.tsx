import { WindowTopbar, DotsLoader } from "../../shared/components";

export function BootScreen() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base">
      <WindowTopbar subtitle="Inicialização" />
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <DotsLoader className="text-xl" />
          <p className="text-sm text-ink">Inicializando...</p>
        </div>
      </div>
    </div>
  );
}
