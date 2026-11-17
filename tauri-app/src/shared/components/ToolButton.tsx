import { useState } from "react";
import { type MouseEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { ComponentType } from "react";

interface Props {
  label: string;
  icon: ComponentType<{ className?: string }>;
  delay?: number;
  disabled: boolean;
  onClick: () => void;
  variant?: "default" | "highlight";
}

export function ToolButton({ label, icon: Icon, delay = 0, disabled, onClick, variant = "default" }: Props) {
  const isHighlight = variant === "highlight";
  const bgClass = isHighlight
    ? "border-line-strong bg-accent-tint/70"
    : "border-line bg-surface";
  const hoverBgClass = isHighlight
    ? "hover:border-accent/40 hover:bg-accent-tint"
    : "hover:border-line-strong hover:bg-surface-raised";
  const hoverShadowClass = isHighlight
    ? "hover:shadow-lift"
    : "hover:shadow-soft";
  const iconBgClass = isHighlight
    ? "bg-surface group-hover:bg-white"
    : "bg-accent-tint group-hover:bg-accent-blush";
  const iconColorClass = isHighlight
    ? "text-accent-strong"
    : "text-accent-soft group-hover:text-accent-strong";
  const rippleColor = "bg-accent/15";
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setRipples((prev) => [...prev, { x: e.clientX - rect.left, y: e.clientY - rect.top, id }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
    onClick();
  };

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 300, damping: 24 }}
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      onClick={handleClick}
      disabled={disabled}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-item border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-40 ${bgClass} ${hoverShadowClass} ${hoverBgClass}`}
    >
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            initial={{ top: r.y, left: r.x, width: 0, height: 0, opacity: 0.4 }}
            animate={{ top: r.y - 100, left: r.x - 100, width: 200, height: 200, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`pointer-events-none absolute rounded-full ${rippleColor}`}
          />
        ))}
      </AnimatePresence>
      <div
        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-110 ${iconBgClass}`}
      >
        <Icon className={`h-4 w-4 transition-colors ${iconColorClass}`} />
      </div>
      <span className="relative z-10 text-sm font-medium leading-snug text-ink-strong transition-colors group-hover:text-ink-strong">
        {label}
      </span>
    </motion.button>
  );
}
