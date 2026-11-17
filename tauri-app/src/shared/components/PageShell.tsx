import React from "react";

export type PageShellVariant = "twoColumn" | "singleColumn";

interface PageShellProps {
  variant?: PageShellVariant;
  rightPanel?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Limita largura (ex: `max-w-6xl`). Para telas que precisam ocupar 100%,
   * passe `w-full`.
   */
  maxWidthClassName?: string;
  className?: string;
}

export function PageShell({
  variant = "singleColumn",
  rightPanel,
  children,
  maxWidthClassName = "w-full",
  className = "",
}: PageShellProps) {
  const containerClass = `w-full ${maxWidthClassName} mx-auto ${className}`.trim();

  if (variant === "twoColumn") {
    return (
      <div className={containerClass}>
        <div className="grid min-h-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="min-w-0">{children}</div>
          <aside className="min-w-0">{rightPanel}</aside>
        </div>
      </div>
    );
  }

  return <div className={containerClass}>{children}</div>;
}

