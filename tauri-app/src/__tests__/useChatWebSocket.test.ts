import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock WebSocket ──────────────────────────────────────────────────────────

type MockWsInstance = {
  onopen: ((e: Event) => void) | null
  onmessage: ((e: MessageEvent) => void) | null
  onclose: ((e: CloseEvent) => void) | null
  onerror: ((e: Event) => void) | null
  readyState: number
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

// Exposed so helpers can fire events on the current instance
let mockWsInstance: MockWsInstance
let wsConstructorCalls = 0

// Regular function so `new WsMock(url)` works
function WsMock(this: MockWsInstance, _url: string) {
  wsConstructorCalls++
  this.onopen = null
  this.onmessage = null
  this.onclose = null
  this.onerror = null
  this.readyState = 0 // CONNECTING
  this.send = vi.fn()
  this.close = vi.fn().mockImplementation(() => {
    this.readyState = 3 // CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: 1000, wasClean: true }))
    }
  })
  mockWsInstance = this
}
;(WsMock as unknown as { OPEN: number }).OPEN = 1

vi.stubGlobal('WebSocket', WsMock)

// ── Mock socket nativo (Tauri) ──────────────────────────────────────────────

const nativeSend = vi.fn<(message: string) => Promise<void>>()
const nativeDisconnect = vi.fn<() => Promise<void>>()

vi.mock('@tauri-apps/plugin-websocket', () => ({
  default: {
    connect: vi.fn(async () => ({
      addListener: () => () => {},
      send: nativeSend,
      disconnect: nativeDisconnect,
    })),
  },
}))

// ── Helpers ─────────────────────────────────────────────────────────────────

function simulateOpen() {
  act(() => {
    mockWsInstance.readyState = 1
    if (mockWsInstance.onopen) mockWsInstance.onopen(new Event('open'))
  })
}

function simulateMessage(data: object) {
  act(() => {
    if (mockWsInstance.onmessage) {
      mockWsInstance.onmessage(
        new MessageEvent('message', { data: JSON.stringify(data) })
      )
    }
  })
}

function simulateClose(code = 1000) {
  act(() => {
    if (mockWsInstance.onclose) {
      mockWsInstance.readyState = 3
      mockWsInstance.onclose(new CloseEvent('close', { code, wasClean: code === 1000 }))
    }
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useChatWebSocket', () => {
  beforeEach(() => {
    wsConstructorCalls = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in connecting status', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const { result } = renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1')
    )
    expect(result.current.status).toBe('connecting')
  })

  it('parses text message with sender=remote', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const { result } = renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1')
    )
    simulateOpen()
    simulateMessage({ sender: 'remote-user', msg_type: 'text', content: 'Ola', timestamp: 9999 })
    expect(result.current.messages).toHaveLength(1)
    const msg = result.current.messages[0]
    expect(msg.sender).toBe('remote')
    expect(msg.type).toBe('text')
    if (msg.type === 'text') expect(msg.content).toBe('Ola')
    expect(msg.timestamp).toBe(9999)
    expect(msg.id).toBeTruthy()
  })

  it('parses file message with all file fields', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const { result } = renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1')
    )
    simulateOpen()
    simulateMessage({
      sender: 'remote-user',
      msg_type: 'file',
      filename: 'doc.pdf',
      mime_type: 'application/pdf',
      file_data: 'base64abc',
      timestamp: 1111,
    })
    expect(result.current.messages).toHaveLength(1)
    const msg = result.current.messages[0]
    expect(msg.type).toBe('file')
    if (msg.type === 'file') {
      expect(msg.filename).toBe('doc.pdf')
      expect(msg.mime_type).toBe('application/pdf')
      expect(msg.file_data).toBe('base64abc')
    }
  })

  it('sendText adds message optimistically as sender=me', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const { result } = renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1')
    )
    simulateOpen()
    act(() => result.current.sendText('Hello world'))
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].sender).toBe('me')
    expect(result.current.messages[0].type).toBe('text')
    if (result.current.messages[0].type === 'text') {
      expect(result.current.messages[0].content).toBe('Hello world')
    }
    const sent = mockWsInstance.send.mock.calls
      .map((call) => JSON.parse(call[0]))
      .find((payload) => payload.msg_type === 'text')
    expect(sent).toBeTruthy()
    expect(sent.msg_type).toBe('text')
    expect(sent.content).toBe('Hello world')
    expect(sent.sender).toBe('me')
  })

  it('sendFile includes all file fields in WS frame', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const { result } = renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1')
    )
    simulateOpen()
    act(() => result.current.sendFile('photo.jpg', 'image/jpeg', 'base64data'))
    const sent = mockWsInstance.send.mock.calls
      .map((call) => JSON.parse(call[0]))
      .find((payload) => payload.msg_type === 'file')
    expect(sent).toBeTruthy()
    expect(sent.msg_type).toBe('file')
    expect(sent.filename).toBe('photo.jpg')
    expect(sent.mime_type).toBe('image/jpeg')
    expect(sent.file_data).toBe('base64data')
  })

  it('sendFile throws for files over 10MB', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const { result } = renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1')
    )
    simulateOpen()
    const bigBase64 = 'A'.repeat(14 * 1024 * 1024)
    act(() => {
      result.current.sendFile('big.bin', 'application/octet-stream', bigBase64)
    })
    expect(result.current.lastError).toContain('Arquivo muito grande')
  })

  it('reconnects with backoff after unexpected close', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    renderHook(() => useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1'))
    simulateOpen()
    simulateClose(1006) // abnormal close
    expect(wsConstructorCalls).toBe(1)
    act(() => vi.advanceTimersByTime(1100)) // first backoff = 1s
    expect(wsConstructorCalls).toBe(2)
  })

  it('does NOT reconnect after disconnect() is called', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const { result } = renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1')
    )
    simulateOpen()
    act(() => result.current.disconnect())
    expect(result.current.status).toBe('disconnected')
    act(() => vi.advanceTimersByTime(5000))
    expect(wsConstructorCalls).toBe(1) // no new WS created
  })

  it('reconnects after close code 4404 (sala transitória durante reconexão)', async () => {
    // 4404/4003 são transitórios: com heartbeat no servidor, o socket fantasma
    // cai em ~50s e a sala/vaga volta. O cliente deve reconectar com backoff,
    // não desistir (comportamento antigo que travava o usuário fora da sala).
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    renderHook(() => useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1'))
    simulateOpen()
    simulateClose(4404)
    expect(wsConstructorCalls).toBe(1)
    act(() => vi.advanceTimersByTime(1100)) // primeiro backoff transitório = 1s
    expect(wsConstructorCalls).toBe(2) // reconectou
  })

  it('transitions to idle after 60s of silence', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const { result } = renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1')
    )
    simulateOpen()
    expect(result.current.status).toBe('connected')
    act(() => vi.advanceTimersByTime(61_000))
    expect(result.current.status).toBe('idle')
  })

  it('echo is NOT added as remote message', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const { result } = renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1')
    )
    simulateOpen()
    let sentTimestamp = 0
    mockWsInstance.send.mockImplementation((data: string) => {
      const parsed = JSON.parse(data)
      sentTimestamp = parsed.timestamp
    })
    act(() => result.current.sendText('my message'))
    simulateMessage({ sender: 'me', msg_type: 'text', content: 'my message', timestamp: sentTimestamp })
    // Should still only have 1 message (the optimistic one), not 2
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].sender).toBe('me')
  })

  it('duplicate incoming message triggers a single receipt and onRemoteMessage', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const onRemoteMessage = vi.fn()
    const { result } = renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1', { onRemoteMessage })
    )
    simulateOpen()
    const frame = { sender: 'remote-user', msg_type: 'text', content: 'oi', timestamp: 42, msg_id: 'dup-1' }
    simulateMessage(frame)
    simulateMessage(frame)
    expect(result.current.messages).toHaveLength(1)
    expect(onRemoteMessage).toHaveBeenCalledTimes(1)
    const delivered = mockWsInstance.send.mock.calls
      .map((call) => JSON.parse(call[0]))
      .filter((payload) => payload.msg_type === 'receipt' && payload.state === 'delivered')
    expect(delivered).toHaveLength(1)
  })

  it('echo does NOT trigger receipt nor onRemoteMessage', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const onRemoteMessage = vi.fn()
    const { result } = renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1', { onRemoteMessage })
    )
    simulateOpen()
    act(() => result.current.sendText('eco'))
    const sent = mockWsInstance.send.mock.calls
      .map((call) => JSON.parse(call[0]))
      .find((payload) => payload.msg_type === 'text')
    // Relay reenvia com outro id (ou sem): só o isLikelyEcho deve barrar.
    simulateMessage({ ...sent, msg_id: undefined })
    expect(onRemoteMessage).not.toHaveBeenCalled()
    expect(result.current.messages).toHaveLength(1)
  })

  it('failed native send marks the message failed and sets lastError', async () => {
    const win = window as unknown as Record<string, unknown>
    win.__TAURI_INTERNALS__ = {}
    nativeSend.mockReset()
    nativeDisconnect.mockReset().mockResolvedValue(undefined)
    // Frames de controle (presence) passam; a mensagem de texto falha.
    nativeSend.mockImplementation(async (payload: string) => {
      if (JSON.parse(payload).msg_type === 'text') throw new Error('broken pipe')
    })
    try {
      const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
      const { result } = renderHook(() =>
        useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1')
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      expect(result.current.status).toBe('connected')

      await act(async () => {
        result.current.sendText('vai falhar')
        await Promise.resolve()
      })
      expect(result.current.messages[0].status).toBe('failed')
      expect(result.current.lastError).toContain('broken pipe')
      expect(wsConstructorCalls).toBe(0)
    } finally {
      delete win.__TAURI_INTERNALS__
    }
  })

  it('closes the orphan native socket when unmounted during connect', async () => {
    const win = window as unknown as Record<string, unknown>
    win.__TAURI_INTERNALS__ = {}
    nativeSend.mockReset().mockResolvedValue(undefined)
    nativeDisconnect.mockReset().mockResolvedValue(undefined)
    const { default: NativeWebSocket } = await import('@tauri-apps/plugin-websocket')
    let resolveConnect: () => void = () => {}
    vi.mocked(NativeWebSocket.connect).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveConnect = () => resolve({
          addListener: () => () => {},
          send: nativeSend,
          disconnect: nativeDisconnect,
        } as unknown as Awaited<ReturnType<typeof NativeWebSocket.connect>>)
      }),
    )
    try {
      const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
      const { unmount } = renderHook(() =>
        useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1')
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      unmount()
      await act(async () => {
        resolveConnect()
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(nativeDisconnect).toHaveBeenCalledTimes(1)
      expect(nativeSend).not.toHaveBeenCalled()
      expect(wsConstructorCalls).toBe(0)
    } finally {
      delete win.__TAURI_INTERNALS__
    }
  })

  it('ignores a late onclose from the socket superseded by a new wsUrl', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    const { result, rerender } = renderHook(
      ({ url }) => useChatWebSocket('room-1', url),
      { initialProps: { url: 'ws://localhost:8765/chat/a' } },
    )
    simulateOpen()
    const oldWs = mockWsInstance
    // Navegador real: close() é assíncrono → onclose chega depois do novo connect.
    oldWs.close.mockImplementation(() => { oldWs.readyState = 3 })
    rerender({ url: 'ws://localhost:8765/chat/b' })
    expect(wsConstructorCalls).toBe(2)
    const newWs = mockWsInstance
    simulateOpen()
    expect(result.current.status).toBe('connected')

    act(() => oldWs.onclose?.(new CloseEvent('close', { code: 1006 })))
    act(() => vi.advanceTimersByTime(35_000))

    expect(wsConstructorCalls).toBe(2) // sem reconexão espúria
    expect(result.current.status).not.toBe('disconnected')
    act(() => result.current.sendText('ainda vivo'))
    expect(newWs.send.mock.calls.some((c) => JSON.parse(c[0]).msg_type === 'text')).toBe(true)
  })

  it('stops reconnect after maxRetries is exceeded', async () => {
    const { useChatWebSocket } = await import('../features/chat/hooks/useChatWebSocket')
    renderHook(() =>
      useChatWebSocket('room-1', 'ws://localhost:8765/chat/room-1', { maxRetries: 3 })
    )
    simulateOpen()

    for (let i = 0; i < 4; i++) {
      simulateClose(1006)
      act(() => vi.advanceTimersByTime(35_000))
      if (i < 3) simulateOpen()
    }

    const callsBefore = wsConstructorCalls
    act(() => vi.advanceTimersByTime(60_000))
    expect(wsConstructorCalls).toBe(callsBefore) // no more reconnects
  })
})
