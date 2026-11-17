export type MetricTone = "neutral" | "healthy" | "warning" | "critical";

export function readPercent(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? Math.min(100, value) : null;
}

export function getMetricTone(percent: number | null, warning = 80): MetricTone {
  if (percent === null) return "neutral";
  if (percent >= 95) return "critical";
  if (percent >= warning) return "warning";
  return "healthy";
}

export function displayValue(value: string): string {
  return !value || value === "..." ? "Não informado" : value;
}

export function formatGb(value: number): string {
  return Number.isFinite(value) && value >= 0
    ? value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
    : "—";
}

export function diskFreeValue(label: string): { readonly value: string; readonly unit: string } {
  const match = label.trim().match(/^([\d.,]+)\s*GB/i);
  if (!match) return { value: label && label !== "..." ? label : "—", unit: "" };
  const amount = Number(match[1].replace(",", "."));
  return { value: formatGb(amount), unit: "GB" };
}

export function formatIpAssignment(value: string): string {
  if (/dhcp|din[aâ]mico/i.test(value)) return "DHCP · dinâmico";
  if (/est[aá]tico|fixo/i.test(value)) return "IP fixo";
  return displayValue(value);
}
