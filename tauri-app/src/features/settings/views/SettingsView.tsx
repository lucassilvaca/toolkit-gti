/**
 * Settings View - Painel único de configuração do aplicativo.
 *
 * Todas as seções (Rede, Sobre) numa página só, sem abas.
 */
import type { ReactNode } from "react";
import { Network, Settings, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageShell } from "../../../shared/components";
import { PortConfiguration } from "../components/PortConfiguration";
import { ScanNetworksConfig } from "../components/ScanNetworksConfig";
import { version as appVersion } from "../../../../package.json";

export function SettingsView() {
  return (
    <PageShell variant="singleColumn" maxWidthClassName="w-full">
      <div className="grid gap-6 pb-8 xl:grid-cols-2">
        <SettingsSection
          icon={Network}
          eyebrow="Conectividade"
          title="Rede e Conectividade"
          description="Configure a porta usada na comunicação interna do aplicativo."
        >
          <PortConfiguration
            className="[&_.shadow-soft]:shadow-none [&_.blur-2xl]:hidden"
          />
        </SettingsSection>

        <SettingsSection
          icon={Users}
          eyebrow="Usuários Online"
          title="Redes da varredura"
          description="Outras VLANs onde procurar máquinas com o Toolkit, além da sua."
        >
          <ScanNetworksConfig />
        </SettingsSection>

        <SettingsSection
          icon={Settings}
          eyebrow="Sistema"
          title="Informações do App"
          description="Detalhes básicos da aplicação e do stack em uso."
        >
          <div className="divide-y divide-line/15">
            <AboutRow label="Versão" value={appVersion} mono />
            <AboutRow label="Framework" value="Tauri 2.0" />
            <AboutRow label="Interface" value="React 18" />
            <AboutRow label="Plataforma" value="Windows · Desktop" />
            <AboutRow
              label="Ambiente"
              value={import.meta.env.DEV ? "Desenvolvimento" : "Produção"}
            />
            <AboutRow label="Licença" value="Uso interno" />
            <AboutRow label="Equipe" value="GTI" />
          </div>
        </SettingsSection>
      </div>
    </PageShell>
  );
}

function SettingsSection({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-item border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <div className="flex max-w-3xl items-start gap-3">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" aria-hidden />
          <div className="min-w-0">
            <div className="text-xs text-ink-muted">
              {eyebrow}
            </div>
            <h2 className="mt-0.5 text-base font-semibold text-ink-strong">
              {title}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{description}</p>
          </div>
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function AboutRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={`${mono ? "font-mono " : ""}text-sm text-ink`}>{value}</span>
    </div>
  );
}
