import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
}

export function UserActionsMenu({ items, ariaLabel }: { items: MenuItem[]; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring rounded-lg p-1.5 text-ink-muted transition hover:bg-surface-overlay hover:text-ink-strong"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-line bg-surface-raised shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="block w-full px-3.5 py-2 text-left text-xs text-ink transition hover:bg-surface-overlay hover:text-ink-strong"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
