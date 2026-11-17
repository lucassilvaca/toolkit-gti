import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock Tauri API
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

describe('useAppEvents Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register no listeners when no callbacks provided', async () => {
    const { useAppEvents } = await import('../shared/hooks/useAppEvents');
    
    renderHook(() => useAppEvents({}));

    // Wait for effect to run
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Should not register any listeners
    expect(mockListen).not.toHaveBeenCalled();
  });

  it('should register app-locked listener when onLock provided', async () => {
    const { useAppEvents } = await import('../shared/hooks/useAppEvents');
    const onLock = vi.fn();
    
    renderHook(() => useAppEvents({ onLock }));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockListen).toHaveBeenCalledWith('app-locked', expect.any(Function));
  });

  it('should register chat-invite-accepted listener when onChatInvite provided', async () => {
    const { useAppEvents } = await import('../shared/hooks/useAppEvents');
    const onChatInvite = vi.fn();
    
    renderHook(() => useAppEvents({ onChatInvite }));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockListen).toHaveBeenCalledWith('chat-invite-accepted', expect.any(Function));
  });

  it('should register app-unlocked listener when onUnlock provided', async () => {
    const { useAppEvents } = await import('../shared/hooks/useAppEvents');
    const onUnlock = vi.fn();
    
    renderHook(() => useAppEvents({ onUnlock }));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockListen).toHaveBeenCalledWith('app-unlocked', expect.any(Function));
  });

  it('should register chat-message listener when onChatMessage provided', async () => {
    const { useAppEvents } = await import('../shared/hooks/useAppEvents');
    const onChatMessage = vi.fn();
    
    renderHook(() => useAppEvents({ onChatMessage }));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockListen).toHaveBeenCalledWith('chat-message', expect.any(Function));
  });

  it('should register all listeners when all callbacks provided', async () => {
    const { useAppEvents } = await import('../shared/hooks/useAppEvents');
    const onLock = vi.fn();
    const onUnlock = vi.fn();
    const onChatInvite = vi.fn();
    const onChatMessage = vi.fn();
    
    renderHook(() => useAppEvents({ onLock, onUnlock, onChatInvite, onChatMessage }));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockListen).toHaveBeenCalledWith('app-locked', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('app-unlocked', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('chat-invite-accepted', expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith('chat-message', expect.any(Function));
    expect(mockListen).toHaveBeenCalledTimes(4);
  });

  it('should unlisten registrations that resolve after unmount', async () => {
    const unlisten = vi.fn();
    let resolveListen: (fn: () => void) => void = () => {};
    mockListen.mockReturnValue(new Promise((resolve) => { resolveListen = resolve; }));

    const { useAppEvents } = await import('../shared/hooks/useAppEvents');
    const { unmount } = renderHook(() => useAppEvents({ onLock: vi.fn() }));

    unmount();
    expect(unlisten).not.toHaveBeenCalled();

    await act(async () => {
      resolveListen(unlisten);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('should cleanup listeners on unmount', async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValue(unlisten);
    
    const { useAppEvents } = await import('../shared/hooks/useAppEvents');
    const onLock = vi.fn();
    
    const { unmount } = renderHook(() => useAppEvents({ onLock }));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    unmount();

    // Cleanup should be called (but may need async handling)
    expect(unlisten).toHaveBeenCalled();
  });
});
