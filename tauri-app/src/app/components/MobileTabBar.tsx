import { TABS } from "../../shared/config/tabs";
import type { TabType } from "../../shared/types/types";

interface MobileTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around gap-0 border-t border-line bg-surface/95 px-1 shadow-soft backdrop-blur-xl md:hidden">
      {TABS.map(({ id: tab, icon: Icon, title, navLabel, mobileLabel }) => {
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            aria-label={title}
            aria-current={activeTab === tab ? "page" : undefined}
            title={title}
            className={`flex h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-md px-0 py-0 transition-colors ${
              activeTab === tab ? "menu-item-active text-ink-strong" : "menu-item"
            }`}
          >
            <Icon size={20} aria-hidden />
            <span className="mt-0.5 text-xs font-medium leading-none">{mobileLabel ?? navLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
