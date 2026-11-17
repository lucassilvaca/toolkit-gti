import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createInvokeCache, useInvokeResource } from "../shared/hooks/useInvokeResource";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const base = { command: "cmd", initialData: [] as string[], fallback: [] as string[], warnMessage: "[test] fail:" };

describe("useInvokeResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("carrega o comando ao montar e expõe os dados", async () => {
    mockInvoke.mockResolvedValue(["a"]);
    const { result } = renderHook(() => useInvokeResource(base));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockInvoke).toHaveBeenCalledWith("cmd");
    expect(result.current.data).toEqual(["a"]);
    expect(result.current.error).toBeNull();
  });

  it("em erro guarda o texto, loga e refresh devolve o fallback", async () => {
    mockInvoke.mockRejectedValue({ message: "boom" });
    const { result } = renderHook(() => useInvokeResource(base));

    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(console.warn).toHaveBeenCalledWith("[test] fail:", { message: "boom" });
    let value: string[] | undefined;
    await act(async () => { value = await result.current.refresh(); });
    expect(value).toEqual([]);
  });

  it("não invoca quando enabled=false", async () => {
    const { result } = renderHook(() => useInvokeResource({ ...base, enabled: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("com cache deduplica chamadas simultâneas e reutiliza o valor", async () => {
    const cache = createInvokeCache<string[]>();
    let resolve!: (v: string[]) => void;
    mockInvoke.mockReturnValue(new Promise((r) => { resolve = r; }));

    const a = renderHook(() => useInvokeResource({ ...base, cache }));
    const b = renderHook(() => useInvokeResource({ ...base, cache }));
    await act(async () => { resolve(["x"]); });

    await waitFor(() => expect(a.result.current.data).toEqual(["x"]));
    await waitFor(() => expect(b.result.current.data).toEqual(["x"]));
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    const c = renderHook(() => useInvokeResource({ ...base, cache }));
    await waitFor(() => expect(c.result.current.data).toEqual(["x"]));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
