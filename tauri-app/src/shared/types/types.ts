import type { LucideIcon } from "lucide-react";

export type TabType =
  | "dashboard"
  | "browsers"
  | "tools"
  | "history"
  | "notifications"
  | "online"
  | "chat"
  | "settings";

export interface TabConfig {
  id: TabType;
  icon: LucideIcon;
  /** Rótulo curto da navegação (sidebar + barra mobile). */
  navLabel: string;
  /** Título do cabeçalho (H1) da tela. */
  title: string;
  /** Contexto auxiliar da tela. */
  subtitle: string;
  /** Rótulo compacto da barra mobile (fallback: navLabel). */
  mobileLabel?: string;
}

export * from "./chat";
