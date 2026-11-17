import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DashboardView } from "../features/system/views/DashboardView";
import { SystemInfoProvider } from "../features/system/hooks/SystemInfoContext";
import { DashboardMetric } from "../features/system/components/DashboardPrimitives";
import { SecurityStatusPanel } from "../features/system/components/SecurityStatusPanel";
import { diskFreeValue, getMetricTone, readPercent } from "../features/system/utils/dashboardMetrics";
import { Cpu } from "lucide-react";
import { dashboardInfo } from "./fixtures/dashboard";
import type { SystemInfo } from "../shared/types/system";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn(async () => "Windows Defender") }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderDashboard(info: SystemInfo = dashboardInfo, error: string | null = null) {
  const refresh = vi.fn(async () => undefined);
  const refreshHealth = vi.fn(async () => undefined);
  render(<SystemInfoProvider value={{ systemInfo: info, loading: false, error, refreshingHealth: false, refresh, refreshHealth, isAdmin: true }}><DashboardView /></SystemInfoProvider>);
  return { refresh, refreshHealth };
}

describe("Dashboard: apresentação de leituras", () => {
  it.each([NaN, Infinity, -1])("trata %s como indisponível", (value) => {
    expect(readPercent(value)).toBeNull();
    expect(getMetricTone(readPercent(value))).toBe("neutral");
  });
  it.each([[0, "healthy"], [80, "warning"], [95, "critical"]] as const)("classifica %s sem transformar zero em alerta", (value, tone) => {
    expect(getMetricTone(readPercent(value))).toBe(tone);
  });
  it("usa limiar próprio para capacidade do disco", () => {
    expect(getMetricTone(84, 85)).toBe("healthy");
    expect(getMetricTone(85, 85)).toBe("warning");
    expect(diskFreeValue("25,5 GB")).toEqual({ value: "25,5", unit: "GB" });
  });
  it("mantém barra sem valor quando disco não tem leitura", () => {
    render(<DashboardMetric label="Disco" icon={Cpu} value="—" percent={null} tone="neutral" status="Sem leitura" detail="Uso não informado" />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "0%" });
  });
  it("mostra atenção e mantém o IP local em um único lugar", async () => {
    renderDashboard();
    await screen.findByText("Windows Defender");
    expect(screen.getByRole("region", { name: "Pontos de atenção" })).toHaveTextContent("Firewall inativo");
    expect(screen.getAllByText(dashboardInfo.localIp)).toHaveLength(1);
    expect(screen.getByRole("heading", { name: dashboardInfo.hostname })).toBeVisible();
  });
  it("distingue firewall desconhecido de proteção confirmada", () => {
    render(<SecurityStatusPanel systemInfo={{ ...dashboardInfo, firewallStatus: "Desconhecido", bitlockerStatus: "...", updateStatus: "..." }} antivirusDetails="" antivirusHealthy={false} antivirusLoading />);
    const firewall = screen.getByRole("heading", { name: "Firewall" }).closest("div.flex");
    expect(firewall?.parentElement).toHaveTextContent("Sem leitura");
    expect(screen.queryByText("Proteção de rede ativa")).not.toBeInTheDocument();
  });
  it("preserva atualização e comando de tarefas", async () => {
    const { refresh, refreshHealth } = renderDashboard();
    await screen.findByText("Windows Defender");
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(refreshHealth).toHaveBeenCalledOnce());
    expect(refresh).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Tarefas" }));
    expect(invoke).toHaveBeenCalledWith("open_task_manager");
  });
  it("mantém recuperação disponível em caso de erro", async () => {
    renderDashboard(dashboardInfo, "Leitura indisponível");
    await screen.findByText("Windows Defender");
    expect(within(screen.getByRole("alert")).getByText("Leitura indisponível")).toBeVisible();
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeEnabled();
  });
});
