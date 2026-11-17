import React from "react";
import type { LucideIcon } from "lucide-react";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  loading?: boolean;
  loadingText?: string;
}

export function PrimaryButton({
  icon: Icon,
  loading,
  loadingText,
  children,
  disabled,
  className = "",
  ...props
}: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={`btn-accent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-40 ${className}`}
      {...props}
    >
      {Icon && <Icon size={14} />}
      {loading ? (loadingText ?? "Aguarde...") : children}
    </button>
  );
}
