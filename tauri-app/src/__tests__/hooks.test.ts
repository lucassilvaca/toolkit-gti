import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock Tauri API
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

// ─── useSettings ──────────────────────────────────────────────────────────────

describe('useSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({
      pingTarget: '8.8.8.8',
      portTarget: 'google.com',
      pingInfinite: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default settings', async () => {
    const { useSettings } = await import('../features/settings/hooks/useSettings');
    const { result } = renderHook(() => useSettings());

    expect(result.current.settings.pingTarget).toBe('8.8.8.8');
    expect(result.current.settings.portTarget).toBe('google.com');
    expect(result.current.settings.pingInfinite).toBe(false);
  });

  it('should call get_settings on mount', async () => {
    const { useSettings } = await import('../features/settings/hooks/useSettings');
    renderHook(() => useSettings());

    expect(mockInvoke).toHaveBeenCalledWith('get_settings');
  });

  it('should update settings partially', async () => {
    const { useSettings } = await import('../features/settings/hooks/useSettings');
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.updateSettings({ pingTarget: '1.1.1.1' });
    });

    expect(result.current.settings.pingTarget).toBe('1.1.1.1');
    expect(result.current.settings.portTarget).toBe('google.com');
  });

  it('should call save_settings when updating', async () => {
    const { useSettings } = await import('../features/settings/hooks/useSettings');
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.updateSettings({ pingInfinite: true });
    });

    expect(mockInvoke).toHaveBeenCalledWith('save_settings', {
      settings: expect.objectContaining({ pingInfinite: true }),
    });
  });
});

// ─── useAuth (extended) ──────────────────────────────────────────────────────

describe('useAuth extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock no session by default
    mockInvoke.mockResolvedValue(null);
  });

  it('should start with unauthenticated state', async () => {
    const { useAuth } = await import('../features/auth/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    expect(result.current.authenticated).toBe(false);
    expect(result.current.user).toBe("");
  });
});
