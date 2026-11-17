import { Compass, Globe, RefreshCw, ShieldCheck, Star } from "lucide-react";
import { PageShell } from "../../../shared/components";
import { useBrowserInfo } from "../hooks/useBrowserInfo";

export function BrowsersView() {
  const { browsers, defaultBrowser, loading, error, refresh } = useBrowserInfo();
  const installedBrowsers = browsers.filter(
    (b) =>
      b.version &&
      b.version !== "Nao instalado" &&
      b.version !== "Não instalado",
  );
  const installedCount = installedBrowsers.length;
  const primaryBrowser = installedBrowsers[0];
  const majorVersion = primaryBrowser?.version.split(".")[0] ?? "-";

  return (
    <PageShell variant="singleColumn" maxWidthClassName="w-full">
      <div className="pb-8">
        <section className="overflow-hidden rounded-item border border-line bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs text-ink-muted">Inventário</p>
              <h2 className="mt-0.5 text-base font-semibold text-ink-strong">Navegadores</h2>
              <p className="mt-1 text-xs text-ink-muted">
                {loading ? "Atualizando..." : `${installedCount} detectado(s)`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <Metric label="Instalados" value={String(installedCount)} icon={Compass} />
              <Metric label="Versão base" value={majorVersion} icon={ShieldCheck} />
            </div>
          </header>

          {defaultBrowser && defaultBrowser !== "..." && defaultBrowser !== "Desconhecido" ? (
            <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Star className="h-4 w-4 shrink-0 text-accent-soft" aria-hidden />
                <div className="min-w-0">
                  <div className="text-xs text-ink-muted">Padrão do sistema</div>
                  <div className="truncate text-sm font-semibold text-ink-strong">
                    {defaultBrowser}
                  </div>
                </div>
              </div>
              <Globe className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            </div>
          ) : null}

          <div className="divide-y divide-line px-5">
            {loading ? (
              <div className="py-6 text-center text-sm text-ink-muted">
                Carregando navegadores...
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center text-sm">
                <span className="text-danger">Não foi possível ler os navegadores.</span>
                <code className="max-w-full break-words rounded-md bg-surface-raised px-2 py-1 font-mono text-xs text-ink-muted">
                  {error}
                </code>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="btn-ghost focus-ring inline-flex items-center gap-2 rounded-item px-4 py-2 text-xs font-medium"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
                </button>
              </div>
            ) : installedBrowsers.length > 0 ? (
              installedBrowsers.map((browser) => (
                <article
                  key={browser.name}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink-strong">
                      {browser.name}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">Navegador instalado</div>
                  </div>
                  <div className="shrink-0 rounded-md bg-accent-tint px-2 py-1 text-xs font-medium text-accent-strong">
                    v{browser.version}
                  </div>
                </article>
              ))
            ) : (
              <div className="py-6 text-center text-sm text-ink-muted">
                Nenhum navegador detectado
              </div>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Compass;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
        <span className="text-xs text-ink-muted">
          {label}
        </span>
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-ink-strong">
        {value}
      </div>
    </div>
  );
}
