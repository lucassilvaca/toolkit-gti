/** Separadores de data e de não-lidas, compartilhados pelas janelas de chat. */

export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="my-2 flex select-none items-center gap-3">
      <span className="h-px flex-1 bg-surface-raised" />
      <span className="rounded-full bg-surface-raised/60 px-3 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <span className="h-px flex-1 bg-surface-raised" />
    </div>
  );
}

export function UnreadSeparator() {
  return (
    <div className="my-2 flex select-none items-center gap-3">
      <span className="h-px flex-1 bg-accent/30" />
      <span className="rounded-full bg-accent/15 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-soft">
        Novas mensagens
      </span>
      <span className="h-px flex-1 bg-accent/30" />
    </div>
  );
}
