import type { ReactNode } from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Interruptor liga/desliga — padrão peer do Uiverse (Javierrocadev, uiverse.io, MIT). */
export function Switch({ checked, onChange, children, disabled = false, className = "" }: SwitchProps) {
  return (
    <label
      className={`inline-flex w-fit cursor-pointer items-center gap-2.5 text-xs text-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${className}`}
    >
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className="relative h-5 w-9 shrink-0 rounded-full bg-surface-overlay shadow-[inset_0_1px_2px_rgba(19,78,74,0.12)] transition-colors duration-170 ease-snap after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface after:shadow-soft after:transition-transform after:duration-170 after:ease-snap after:content-[''] peer-checked:bg-accent peer-checked:after:translate-x-4 peer-hover:after:scale-95 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-base"
      />
      {children}
    </label>
  );
}
