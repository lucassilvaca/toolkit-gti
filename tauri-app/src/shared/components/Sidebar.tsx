import { useState } from "react";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { SidebarItem } from "./SidebarItem";
import type { SystemInfo } from "../types/system";
import type { TabType } from "../types/types";
import { TABS } from "../config/tabs";

interface Props {
  systemInfo: SystemInfo;
  activeTab: TabType;
  unreadChat: number;
  isAdmin: boolean;
  onTabChange: (tab: TabType) => void;
  onLogout: () => void;
}

const COLLAPSED_KEY = "sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Preferência visual: sem storage, só não persiste.
  }
}

export function Sidebar({
  systemInfo,
  activeTab,
  unreadChat,
  isAdmin,
  onTabChange,
  onLogout,
}: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const username = systemInfo?.username || "Usuário";
  const initials = username.slice(0, 2).toUpperCase();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    saveCollapsed(next);
  };

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? "Expandir menu" : "Recolher menu (só ícones)";

  return (
    <aside
      className={`relative z-30 my-4 ml-4 hidden shrink-0 flex-col rounded-card bg-surface shadow-soft transition-[width,padding] duration-170 ease-snap motion-reduce:transition-none md:flex ${
        collapsed ? "w-[76px] p-2.5" : "w-[232px] p-3.5"
      }`}
    >
      {/* Marca + recolher */}
      <div
        className={`flex items-center pb-6 pt-2 ${
          collapsed ? "flex-col gap-3 px-0" : "gap-2.5 px-2.5"
        }`}
      >
        <BrandLogo className="h-8 w-8 shrink-0 object-contain" alt="Logo Toolkit GTI" />
        {!collapsed && (
          <span className="flex-1 truncate font-display text-[26px] font-semibold leading-none text-accent-strong">
            Toolkit
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          title={toggleLabel}
          className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-accent-tint hover:text-accent-strong"
        >
          <ToggleIcon className="h-[18px] w-[18px]" />
        </button>
      </div>

      <nav aria-label="Navegação principal" className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
        {TABS.map((item) => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.navLabel}
            active={activeTab === item.id}
            badge={item.id === "chat" ? unreadChat : undefined}
            collapsed={collapsed}
            onClick={() => onTabChange(item.id)}
          />
        ))}
      </nav>

      {/* Operador / sair */}
      <div
        className={`mt-3 flex items-center rounded-item bg-surface-raised p-2.5 ${
          collapsed ? "flex-col gap-2 px-1.5" : "gap-3"
        }`}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-item bg-accent-tint text-xs font-semibold text-accent-strong"
          title={collapsed ? `${username} · ${isAdmin ? "Administrador" : "Sessão segura"}` : undefined}
        >
          {initials}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink-strong">{username}</span>
            <span className="block text-xs text-ink-muted">{isAdmin ? "Administrador" : "Sessão segura"}</span>
          </span>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-accent-tint hover:text-accent-strong"
          aria-label="Sair"
          title="Sair"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </aside>
  );
}
