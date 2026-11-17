import type { CSSProperties } from "react";

const a11y = (label?: string) =>
  label ? { role: "status", "aria-label": label } : { "aria-hidden": true };

interface RadarLoaderProps {
  size?: number;
  /** Sem label o radar é decorativo (há texto visível ao lado). */
  label?: string;
}

/** Radar giratório — usado enquanto a rede é varrida. */
export function RadarLoader({ size = 120, label }: RadarLoaderProps) {
  return (
    <div
      className="radar"
      style={{ "--radar-size": `${size}px` } as CSSProperties}
      {...a11y(label)}
    >
      <span />
    </div>
  );
}

interface DotsLoaderProps {
  /** Sem label os pontos são decorativos (há texto visível ao lado). */
  label?: string;
  className?: string;
}

/** Três pontos pulsando — carregamentos genéricos (telas, histórico). */
export function DotsLoader({ label, className = "" }: DotsLoaderProps) {
  return (
    <span className={`dots-loader ${className}`} {...a11y(label)}>
      <span />
      <span />
      <span />
    </span>
  );
}
