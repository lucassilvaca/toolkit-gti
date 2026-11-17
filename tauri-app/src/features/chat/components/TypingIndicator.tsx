interface TypingIndicatorProps {
  /** Quem está digitando. */
  name: string;
  /** Classes do contêiner (layout varia por janela). */
  className: string;
}

/** Três pontos animados + "<nome> está digitando…". */
export function TypingIndicator({ name, className }: TypingIndicatorProps) {
  return (
    <div className={className}>
      <span className="flex gap-0.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-soft [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-soft [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-soft" />
      </span>
      {name} está digitando…
    </div>
  );
}
