import { MAX_MESSAGE_BYTES } from './chatProtocol'
import type { NativeSocket, NativeSocketMessage } from './chatProtocol'

/**
 * Adaptador único sobre o WebSocket do navegador e o socket nativo do Tauri.
 * O hook só conhece esta interface — nada de ramos "nativo ou navegador".
 */
export interface ChatSocket {
  readonly kind: 'native' | 'browser'
  /** Pronto para enviar (navegador: readyState OPEN; nativo: sempre, enquanto existir). */
  isOpen(): boolean
  /**
   * Nativo: devolve a promise do envio. Navegador: envia de forma síncrona e
   * LANÇA se o socket não estiver aberto (o chamador decide o que fazer).
   */
  send(payload: string): Promise<void> | undefined
  /** Fecha sem disparar onClose no nativo (o listener é removido antes). */
  close(): void
}

export interface ChatSocketHandlers {
  onOpen: (socket: ChatSocket) => void
  onText: (payload: string) => void
  /** Qualquer frame não-Close recebido no nativo (alimenta o watchdog). */
  onActivity: () => void
  onError: () => void
  onClose: (code?: number) => void
}

/** Envia um frame de controle (presence/typing/receipt). Nunca lança. */
export function sendQuietly(socket: ChatSocket | null, frame: object): void {
  try {
    socket?.send(JSON.stringify(frame))?.catch(() => { /* socket fechando — ignora */ })
  } catch {
    /* socket fechando — ignora */
  }
}

export function connectBrowserSocket(url: string, handlers: ChatSocketHandlers): ChatSocket {
  const ws = new WebSocket(url)
  const socket: ChatSocket = {
    kind: 'browser',
    isOpen: () => ws.readyState === WebSocket.OPEN,
    send: (payload) => {
      if (ws.readyState !== WebSocket.OPEN) throw new Error('offline')
      ws.send(payload)
      return undefined
    },
    close: () => ws.close(),
  }

  ws.onopen = () => handlers.onOpen(socket)
  // Navegador fecha logo após o erro (dispara onclose).
  ws.onerror = () => handlers.onError()
  ws.onmessage = (event: MessageEvent) => handlers.onText(event.data as string)
  ws.onclose = (event: CloseEvent) => handlers.onClose(event.code)
  return socket
}

/**
 * Conecta o socket nativo. Retorna null se `isCancelled()` virar true durante o
 * connect (o socket órfão é fechado). Lança se o connect falhar.
 */
export async function connectNativeSocket(
  url: string,
  handlers: ChatSocketHandlers,
  isCancelled: () => boolean,
): Promise<ChatSocket | null> {
  const { default: NativeWebSocket } = await import('@tauri-apps/plugin-websocket')
  if (isCancelled()) return null
  const native = (await NativeWebSocket.connect(url, {
    maxMessageSize: MAX_MESSAGE_BYTES,
    maxFrameSize: MAX_MESSAGE_BYTES,
  })) as NativeSocket

  // Cleanup rodou com o connect pendente → fecha o socket órfão e desiste.
  if (isCancelled()) {
    native.disconnect().catch(() => { /* já fechado */ })
    return null
  }

  let unlisten: (() => void) | null = null
  const socket: ChatSocket = {
    kind: 'native',
    isOpen: () => true,
    send: (payload) => native.send(payload),
    close: () => {
      unlisten?.()
      unlisten = null
      native.disconnect().catch(() => { /* já fechado */ })
    },
  }

  handlers.onOpen(socket)

  unlisten = native.addListener((message: NativeSocketMessage) => {
    // Qualquer frame recebido (texto, ping, pong, binário) prova que a conexão vive.
    if (message.type !== 'Close') handlers.onActivity()

    if (message.type === 'Text' && typeof message.data === 'string') {
      handlers.onText(message.data)
      return
    }

    if (message.type === 'Close') {
      unlisten?.()
      unlisten = null
      const frame =
        message.data && typeof message.data === 'object' && 'code' in message.data
          ? message.data
          : null
      handlers.onClose(frame?.code)
    }
  })
  return socket
}
