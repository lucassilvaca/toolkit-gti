/**
 * Fonte ÚNICA de verdade da navegação por abas.
 *
 * Antes os rótulos viviam em três lugares (TABS em types.ts, navItems na
 * Sidebar e um array literal na barra mobile do App), com textos divergentes.
 * Agora Sidebar, header do App e barra mobile consomem esta lista.
 *
 * - `navLabel`: rótulo curto da navegação (tooltip da sidebar)
 * - `mobileLabel`: rótulo compacto da barra mobile
 * - `title`:    título do cabeçalho (H1) de cada tela
 * - `subtitle`: contexto auxiliar da tela
 * - `icon`:     ícone da navegação
 */
import {
  LayoutGrid,
  Compass,
  FileText,
  Wrench,
  Bell,
  Users,
  MessageSquare,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TabType, TabConfig } from "../types/types";

export const TABS: TabConfig[] = [
  { id: "dashboard",     icon: LayoutGrid,    navLabel: "Resumo do Sistema", title: "Resumo do Sistema",     subtitle: "Monitoramento em tempo real da estação de trabalho.", mobileLabel: "Início" },
  { id: "browsers",      icon: Compass,       navLabel: "Ambiente Web",      title: "Ambiente Web",          subtitle: "Gerenciamento de versões e compatibilidade.", mobileLabel: "Web" },
  { id: "history",       icon: FileText,      navLabel: "Histórico",         title: "Logs de Auditoria",     subtitle: "Histórico de ações técnicas realizadas.", mobileLabel: "Logs" },
  { id: "tools",         icon: Wrench,        navLabel: "Ferramentas",       title: "Central de Diagnóstico", subtitle: "Ferramentas avançadas de suporte.", mobileLabel: "Ferr." },
  { id: "notifications", icon: Bell,          navLabel: "Chamados",          title: "Chamar Usuário",        subtitle: "Acione o usuário e inicie contato pela rede local.", mobileLabel: "Cham." },
  { id: "online",        icon: Users,         navLabel: "Usuários Online",   title: "Usuários Online",       subtitle: "Máquinas com o Toolkit ativo na rede local.", mobileLabel: "Online" },
  { id: "chat",          icon: MessageSquare, navLabel: "Chat",              title: "Chat Interno",          subtitle: "Comunicação direta pela rede local.", mobileLabel: "Chat" },
  { id: "settings",      icon: Settings,      navLabel: "Configurações",     title: "Configurações",         subtitle: "Preferências e configurações do aplicativo.", mobileLabel: "Config" },
];

/** Mapa id → ícone, derivado de TABS (sem segunda lista para manter em sincronia). */
export const TAB_ICONS = Object.fromEntries(
  TABS.map((tab) => [tab.id, tab.icon]),
) as Record<TabType, LucideIcon>;
