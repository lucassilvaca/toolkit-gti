import React from "react";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  labelRight?: React.ReactNode;
  /** id do controle, para o label nomeá-lo (leitor de tela, getByLabel). */
  htmlFor?: string;
}

export function FormField({ label, icon: Icon, children, labelRight, htmlFor }: Props) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-ink">
        <span className="flex items-center gap-1.5">
          {Icon && <Icon size={11} />}
          {label}
        </span>
        {labelRight}
      </label>
      {children}
    </div>
  );
}
