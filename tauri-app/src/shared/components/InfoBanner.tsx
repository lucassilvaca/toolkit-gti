import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  variant?: "cyan" | "neutral";
}

export function InfoBanner({ icon: Icon, title, description, variant = "cyan" }: Props) {
  return (
    <div
      className={`flex items-start gap-3.5 rounded-item border px-4 py-3.5 transition-colors ${
        variant === "cyan"
          ? "border-line-strong bg-accent-tint/60"
          : "border-line bg-surface-raised"
      }`}
    >
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface">
        <Icon size={18} className="text-accent-soft" />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold tracking-[0.01em] text-ink-strong">{title}</p>
        <p className="mt-1 text-xs leading-5 text-ink">{description}</p>
      </div>
    </div>
  );
}
