import { LucideIcon } from "lucide-react";

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: number;
  /** Menu recolhido: só o ícone; o nome vira tooltip. */
  collapsed?: boolean;
  onClick?: () => void;
}

export function SidebarItem({
  icon: Icon,
  label,
  active = false,
  badge,
  collapsed = false,
  onClick,
}: SidebarItemProps) {
  const hasBadge = badge != null && badge > 0;
  const badgeText = hasBadge ? (badge > 99 ? "99+" : String(badge)) : "";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={hasBadge ? `${label} (${badgeText} não lidas)` : label}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`menu-item focus-ring group relative flex h-11 w-full items-center gap-3 text-left text-[14px] active:scale-[0.98] ${
        collapsed ? "justify-center px-0" : "px-3.5"
      } ${active ? "menu-item-active" : ""}`}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 transition-transform duration-150 ease-snap ${
          active ? "" : "group-hover:scale-110"
        }`}
        aria-hidden
      />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}

      {hasBadge &&
        (collapsed ? (
          <span
            aria-hidden
            className="absolute right-2 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface"
          >
            {badgeText}
          </span>
        ) : (
          <span
            aria-hidden
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold leading-none text-white"
          >
            {badgeText}
          </span>
        ))}
    </button>
  );
}
