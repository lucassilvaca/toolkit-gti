import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();

// Guarda os callbacks registrados por listen(), permitindo disparar eventos do
// backend (network-output / network-done / command-output) manualmente no teste.
const listeners = new Map<string, (e: { payload: unknown }) => void>();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, cb: (e: { payload: unknown }) => void) => {
    listeners.set(event, cb);
    return Promise.resolve(() => listeners.delete(event));
  },
}));

const addLog = vi.fn();
vi.mock("../features/history/hooks/useLogHistory", () => ({
  useLogHistory: () => ({ addLog }),
}));

function emitEvent(event: string, payload: unknown) {
  act(() => {
    listeners.get(event)?.({ payload });
  });
}

async function loadHook() {
  const { useTauriCommands } = await import(
    "../features/system/hooks/useTauriCommands"
  );
  return renderHook(() => useTauriCommands());
}

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
});

// ── runPing (bloqueante) ─────────────────────────────────────────────────────

describe("useTauriCommands · runPing (bloqueante)", () => {
  it("invoca run_ping com o target e guarda o resultado de sucesso", async () => {
    mockInvoke.mockResolvedValue({ success: true, output: "Resposta de 8.8.8.8" });
    const { result } = await loadHook();

    await act(async () => {
      await result.current.runPing("8.8.8.8");
    });

    expect(mockInvoke).toHaveBeenCalledWith("run_ping", { target: "8.8.8.8" });
    expect(result.current.lastResult).toEqual({
      success: true,
      output: "Resposta de 8.8.8.8",
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(false);
  });

  it("captura erro do backend em lastResult sem lançar", async () => {
    mockInvoke.mockRejectedValue(new Error("host inacessível"));
    const { result } = await loadHook();

    await act(async () => {
      await result.current.runPing("destino.invalido");
    });

    expect(result.current.lastResult?.success).toBe(false);
    expect(result.current.lastResult?.error).toBe("host inacessível");
    expect(result.current.isLoading).toBe(false);
  });
});

// ── runPing (contínuo / streaming) ───────────────────────────────────────────

describe("useTauriCommands · runPing (contínuo)", () => {
  it("entra em modo streaming e só encerra ao receber network-done", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = await loadHook();

    await act(async () => {
      await result.current.runPing("8.8.8.8", true);
    });

    expect(mockInvoke).toHaveBeenCalledWith("run_network_streaming", {
      command: "ping_continuous",
      target: "8.8.8.8",
    });
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.isLoading).toBe(true);

    // Backend sinaliza fim
    emitEvent("network-done", true);

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("acumula linhas de network-output em streamingLines", async () => {
    const { result } = await loadHook();

    emitEvent("network-output", "Resposta de 8.8.8.8: bytes=32");
    emitEvent("network-output", "Resposta de 8.8.8.8: bytes=32 tempo=1ms");

    await waitFor(() => {
      expect(result.current.streamingLines).toEqual([
        "Resposta de 8.8.8.8: bytes=32",
        "Resposta de 8.8.8.8: bytes=32 tempo=1ms",
      ]);
    });
  });
});

// ── runMaintenance · roteamento streaming vs bloqueante ──────────────────────

describe("useTauriCommands · runMaintenance", () => {
  it.each(["dism_health", "sfc_scan", "gpupdate"] as const)(
    "roteia a tarefa pesada '%s' para run_command_streaming",
    async (task) => {
      mockInvoke.mockResolvedValue(undefined);
      const { result } = await loadHook();

      await act(async () => {
        await result.current.runMaintenance(task);
      });

      expect(mockInvoke).toHaveBeenCalledWith("run_command_streaming", { task });
      expect(result.current.isStreaming).toBe(true);
    }
  );

  it("executa tarefa simples via run_maintenance e guarda o resultado", async () => {
    mockInvoke.mockResolvedValue({ success: true, output: "Temp limpo" });
    const { result } = await loadHook();

    await act(async () => {
      await result.current.runMaintenance("clean_temp");
    });

    expect(mockInvoke).toHaveBeenCalledWith("run_maintenance", {
      task: "clean_temp",
    });
    expect(result.current.lastResult?.success).toBe(true);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});

// ── runToolWithTarget (nslookup) ─────────────────────────────────────────────

describe("useTauriCommands · runToolWithTarget", () => {
  it("invoca run_tool_with_target com task=nslookup", async () => {
    mockInvoke.mockResolvedValue({ success: true, output: "Endereço: 8.8.8.8" });
    const { result } = await loadHook();

    await act(async () => {
      await result.current.runToolWithTarget("google.com");
    });

    expect(mockInvoke).toHaveBeenCalledWith("run_tool_with_target", {
      task: "nslookup",
      target: "google.com",
    });
    expect(result.current.lastResult?.output).toBe("Endereço: 8.8.8.8");
  });
});

// ── runIpconfig (flushdns / config / renew) ──────────────────────────────────

describe("useTauriCommands · runIpconfig", () => {
  it.each(["flushdns", "config", "renew"] as const)(
    "invoca run_ipconfig com action='%s' e guarda o resultado",
    async (action) => {
      mockInvoke.mockResolvedValue({ success: true, output: "ok" });
      const { result } = await loadHook();

      await act(async () => {
        await result.current.runIpconfig(action);
      });

      expect(mockInvoke).toHaveBeenCalledWith("run_ipconfig", { action });
      expect(result.current.lastResult?.success).toBe(true);
      expect(result.current.isLoading).toBe(false);
    }
  );

  it("captura erro do backend em lastResult sem lançar", async () => {
    mockInvoke.mockRejectedValue(new Error("acesso negado"));
    const { result } = await loadHook();

    await act(async () => {
      await result.current.runIpconfig("renew");
    });

    expect(result.current.lastResult?.success).toBe(false);
    expect(result.current.lastResult?.error).toBe("acesso negado");
    expect(result.current.isLoading).toBe(false);
  });
});

// ── checkWebPorts ────────────────────────────────────────────────────────────

describe("useTauriCommands · checkWebPorts", () => {
  it("retorna o resultado e reflete o status em lastResult", async () => {
    mockInvoke.mockResolvedValue({
      host: "google.com",
      port80: true,
      port443: true,
      message: "HTTP (80): Aberta  |  HTTPS (443): Aberta",
    });
    const { result } = await loadHook();

    let returned: unknown;
    await act(async () => {
      returned = await result.current.checkWebPorts("google.com");
    });

    expect(mockInvoke).toHaveBeenCalledWith("check_web_ports", {
      host: "google.com",
    });
    expect(returned).toMatchObject({ port80: true, port443: true });
    expect(result.current.lastResult?.success).toBe(true);
    expect(result.current.lastResult?.output).toContain("Aberta");
  });
});

// ── stopStreaming ────────────────────────────────────────────────────────────

describe("useTauriCommands · stopStreaming", () => {
  it("invoca stop_streaming_command e zera os estados de execução", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = await loadHook();

    // Coloca em modo streaming primeiro
    await act(async () => {
      await result.current.runPing("8.8.8.8", true);
    });
    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      await result.current.stopStreaming();
    });

    expect(mockInvoke).toHaveBeenCalledWith("stop_streaming_command");
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});
