import { useState } from "react";
import { Copy, Check, Info } from "lucide-react";
import { motion } from "motion/react";

interface Props {
  label: string;
  value: string;
  isMono?: boolean;
  isLast?: boolean;
  onInfoClick?: () => void;
}

export function CopyableField({
  label,
  value,
  isMono = false,
  isLast = false,
  onInfoClick,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={`group grid gap-1 py-1.5 md:grid-cols-[minmax(112px,132px)_minmax(0,1fr)] md:items-center md:gap-4 ${
        !isLast ? "border-b border-line" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-xs font-medium text-ink-muted">
          {label}
        </span>
        {onInfoClick ? (
          <button
            onClick={onInfoClick}
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-accent/15 hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <button
        onClick={handleCopy}
        className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-1 text-left text-ink-strong transition-colors hover:bg-accent/10 hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        title="Copiar"
      >
        <span
          className={`min-w-0 flex-1 text-[14px] leading-6 text-ink-strong ${
            isMono ? "font-mono text-[14px] [overflow-wrap:anywhere]" : "break-words"
          }`}
        >
          {value}
        </span>
        <div className="flex h-5 w-5 shrink-0 items-center justify-center">
          {copied ? (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
              <Check className="h-3.5 w-3.5 text-accent-soft" />
            </motion.div>
          ) : (
            <Copy className="h-3.5 w-3.5 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
      </button>
    </div>
  );
}
