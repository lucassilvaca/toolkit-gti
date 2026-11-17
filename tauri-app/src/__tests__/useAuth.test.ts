import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked((await import('@tauri-apps/api/core')).invoke);

describe('useAuth Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: no session
    mockInvoke.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with authenticated false and empty user', async () => {
    const { useAuth } = await import('../features/auth/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.authenticated).toBe(false);
      expect(result.current.user).toBe("");
    });
  });

  it('should update state when session exists', async () => {
    mockInvoke.mockResolvedValue({
      user: "test.user",
      authenticated_at: "2024-01-01T00:00:00Z",
      expires_in_minutes: 30
    });

    const { useAuth } = await import('../features/auth/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.authenticated).toBe(true);
      expect(result.current.user).toBe("test.user");
    });
  });

  it('should login successfully', async () => {
    mockInvoke.mockResolvedValue({
      user: "test.user",
      authenticated_at: "2024-01-01T00:00:00Z",
      expires_in_minutes: 30
    });

    const { useAuth } = await import('../features/auth/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    let loginResult: boolean | undefined;

    await act(async () => {
      loginResult = await result.current.login("test.user", "password");
    });

    expect(loginResult).toBe(true);
    expect(result.current.authenticated).toBe(true);
    expect(result.current.user).toBe("test.user");
  });

  it('should handle login failure', async () => {
    mockInvoke.mockRejectedValue(new Error("Invalid credentials"));

    const { useAuth } = await import('../features/auth/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    let loginResult: boolean | undefined;

    await act(async () => {
      loginResult = await result.current.login("invalid", "credentials");
    });

    expect(loginResult).toBe(false);
    expect(result.current.authenticated).toBe(false);
    expect(result.current.user).toBe("");
  });

  it('rethrows non-credential errors (rate limit) instead of returning false', async () => {
    const blocked = { message: "Muitas tentativas. Tente novamente em 15 minutos", code: "RATE_LIMITED" };
    mockInvoke.mockRejectedValue(blocked);

    const { useAuth } = await import('../features/auth/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await expect(result.current.login("tecnico", "x")).rejects.toBe(blocked);
    });
    expect(result.current.authenticated).toBe(false);
  });

  it('should logout successfully', async () => {
    const { useAuth } = await import('../features/auth/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.authenticated).toBe(false);
    expect(result.current.user).toBe("");
    expect(mockInvoke).toHaveBeenCalledWith("logout");
  });

  it('não renova a sessão sozinho perto de expirar (bloqueio por inatividade)', async () => {
    mockInvoke.mockResolvedValue({
      user: "test.user",
      authenticated_at: "2024-01-01T00:00:00Z",
      expires_in_minutes: 1
    });

    const { useAuth } = await import('../features/auth/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.authenticated).toBe(true));
    expect(mockInvoke).not.toHaveBeenCalledWith("refresh_session");
  });

  it('volta ao login quando a janela recebe foco com a sessão já expirada', async () => {
    mockInvoke.mockResolvedValue({
      user: "test.user",
      authenticated_at: "2024-01-01T00:00:00Z",
      expires_in_minutes: 15
    });

    const { useAuth } = await import('../features/auth/hooks/useAuth');
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.authenticated).toBe(true));

    // Sessão venceu enquanto a janela estava na bandeja (timers pausados).
    mockInvoke.mockResolvedValue(null);
    act(() => { window.dispatchEvent(new Event("focus")); });

    await waitFor(() => expect(result.current.authenticated).toBe(false));
  });

  it('should include required functions', async () => {
    const { useAuth } = await import('../features/auth/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    expect(typeof result.current.login).toBe('function');
    expect(typeof result.current.logout).toBe('function');
    expect(typeof result.current.refreshSession).toBe('function');
  });
});
