import { useState, useRef, useEffect, useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { getCurrentUser } from '../../auth/services/currentUser'
import { processMessageWithFilter, DEFAULT_FILTER_SETTINGS } from '../../../shared/utils/languageFilter'
import type {
  WsChatMessage,
  WsConnectionStatus,
  WsPresenceState,
} from '../../../shared/types/chat'
import {
  BACKOFF_DELAYS,
  ROOM_GONE_MAX_RETRIES,
  WATCHDOG_TIMEOUT_MS,
  isLikelyEcho,
  shouldUseNativeSocket,
  validateOutgoingFile,
} from '../services/chatProtocol'
import { errorText } from '../../../shared/utils/errorText'
import {
  presenceFrame,
  clientIdentityFrame,
  receiptFrame,
  textFrame,
  fileFrame,
  sessionEndFrame,
} from '../services/chatFrames'
import { connectBrowserSocket, connectNativeSocket, sendQuietly } from '../services/chatTransport'
import type { ChatSocket, ChatSocketHandlers } from '../services/chatTransport'
import { parseIncoming } from '../services/incomingFrames'
import type { IncomingFrame } from '../services/incomingFrames'
import { applyReceipt, setMessageStatus } from '../utils/messageStatus'
import { useTypingSignals } from './useTypingSignals'

interface UseChatWebSocketOptions {
  maxRetries?: number
  onRemoteMessage?: (message: WsChatMessage) => void
  participantRole?: 'tech' | 'user'
  presenceState?: Exclude<WsPresenceState, 'unknown'>
  onPresenceChange?: (presence: Exclude<WsPresenceState, 'unknown'>) => void
  /** Recebido pelo técnico quando o usuário anuncia o login Windows na sala. */
  onRemoteClientIdentity?: (displayName: string) => void
  /** Disparado quando o OUTRO lado encerra o atendimento (frame session_end). */
  onSessionEnd?: () => void
  enableLanguageFilter?: boolean
  onMessageError?: (error: string, messageType?: 'text' | 'file') => void
}

type TimerRef = MutableRefObject<ReturnType<typeof setTimeout> | null>
type OwnBody =
  | { type: 'text'; content: string }
  | { type: 'file'; filename: string; mime_type: string; file_data: string }

const IDLE_AFTER_MS = 60_000
const PENDING_TTL_MS = 10_000

function clearTimer(ref: TimerRef) {
  if (ref.current) {
    clearTimeout(ref.current)
    ref.current = null
  }
}

function outgoingFrame(msg: WsChatMessage) {
  return msg.type === 'text'
    ? textFrame(msg.content, msg.timestamp, msg.id)
    : fileFrame(msg.filename, msg.mime_type, msg.file_data, msg.timestamp, msg.id)
}

export function useChatWebSocket(
  roomId: string,
  wsUrl: string,
  options?: UseChatWebSocketOptions,
) {
  const maxRetries = options?.maxRetries ?? Infinity
  const onRemoteMessage = options?.onRemoteMessage
  const participantRole = options?.participantRole ?? 'tech'
  const presenceState = options?.presenceState ?? 'active'
  const onPresenceChange = options?.onPresenceChange
  const enableLanguageFilter = options?.enableLanguageFilter ?? true
  const onMessageError = options?.onMessageError
  const [messages, setMessages] = useState<WsChatMessage[]>([])
  const [status, setStatus] = useState<WsConnectionStatus>('connecting')
  const [lastError, setLastError] = useState<string | null>(null)

  const messagesRef = useRef<WsChatMessage[]>([])
  const initialMessagesRef = useRef<WsChatMessage[]>([])
  const unreadIncomingRef = useRef<Set<string>>(new Set())

  const socketRef = useRef<ChatSocket | null>(null)
  const intentionalRef = useRef(false)
  const retriesRef = useRef(0)
  const roomGoneRetriesRef = useRef(0)
  const watchdogTimerRef: TimerRef = useRef(null)
  const idleTimerRef: TimerRef = useRef(null)
  const reconnectTimerRef: TimerRef = useRef(null)
  const pendingIds = useRef(new Map<string, number>())
  const latestPresenceRef = useRef<Exclude<WsPresenceState, 'unknown'>>(presenceState)
  const onRemoteMessageRef = useRef(onRemoteMessage)
  const onPresenceChangeRef = useRef(onPresenceChange)
  const onRemoteClientIdentityRef = useRef(options?.onRemoteClientIdentity)
  const onSessionEndRef = useRef(options?.onSessionEnd)
  const onMessageErrorRef = useRef(onMessageError)

  useEffect(() => {
    onMessageErrorRef.current = onMessageError
  }, [onMessageError])

  useEffect(() => {
    onSessionEndRef.current = options?.onSessionEnd
  }, [options?.onSessionEnd])

  useEffect(() => {
    onRemoteMessageRef.current = onRemoteMessage
  }, [onRemoteMessage])

  useEffect(() => {
    onPresenceChangeRef.current = onPresenceChange
  }, [onPresenceChange])

  useEffect(() => {
    onRemoteClientIdentityRef.current = options?.onRemoteClientIdentity
  }, [options?.onRemoteClientIdentity])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  /** Envia um frame de controle (typing/receipt) pelo socket ativo. Nunca lança. */
  const sendControl = useCallback((obj: Record<string, unknown>) => {
    sendQuietly(socketRef.current, obj)
  }, [])

  const { remoteTyping, notifyTyping, stopTyping, handleRemoteTyping, clearRemoteTyping } =
    useTypingSignals(participantRole, sendControl)

  /** Fecha e esquece o socket ativo (sem onClose no nativo). */
  const dropSocket = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
  }, [])

  useEffect(() => {
    // Flag por execução do efeito: intentionalRef é resetado no próximo efeito,
    // então um connect nativo pendente do efeito anterior precisa da própria.
    let cancelled = false
    const isStale = () => cancelled || intentionalRef.current
    intentionalRef.current = false
    retriesRef.current = 0
    roomGoneRetriesRef.current = 0
    pendingIds.current.clear()
    setMessages(initialMessagesRef.current)

    // Reinicia o watchdog a cada tráfego recebido (dados ou ping do servidor).
    // Se nada chegar dentro da janela, a conexão está morta → força reconexão.
    const armWatchdog = () => {
      clearTimer(watchdogTimerRef)
      watchdogTimerRef.current = setTimeout(() => {
        if (intentionalRef.current) return
        dropSocket()
        scheduleReconnect()
      }, WATCHDOG_TIMEOUT_MS)
    }

    const emitPresence = (nextPresence: Exclude<WsPresenceState, 'unknown'>) => {
      latestPresenceRef.current = nextPresence
      sendQuietly(socketRef.current, presenceFrame(participantRole, nextPresence, Date.now()))
    }

    const sendClientIdentityIfUser = async () => {
      if (participantRole !== 'user') return
      let displayName = ''
      try {
        if (shouldUseNativeSocket()) {
          const raw = await getCurrentUser()
          displayName = (raw ?? '').trim()
        }
      } catch {
        /* dev / browser */
      }
      if (!displayName) return
      sendQuietly(socketRef.current, clientIdentityFrame(displayName.slice(0, 128), Date.now()))
    }

    const resetIdle = () => {
      clearTimer(idleTimerRef)
      idleTimerRef.current = setTimeout(() => {
        setStatus((s) => (s === 'connected' ? 'idle' : s))
      }, IDLE_AFTER_MS)
    }

    // Ao receber uma mensagem do outro lado: ele parou de digitar, confirma
    // entrega e — se esta janela está ativa — confirma leitura na hora.
    const acknowledgeIncoming = (incomingId: string) => {
      clearRemoteTyping()
      const now = Date.now()
      sendQuietly(socketRef.current, receiptFrame('delivered', [incomingId], now))
      if (latestPresenceRef.current === 'active') {
        sendQuietly(socketRef.current, receiptFrame('read', [incomingId], now))
      } else {
        unreadIncomingRef.current.add(incomingId)
      }
    }

    const handleChatMessage = (frame: Extract<IncomingFrame, { kind: 'text' | 'file' }>) => {
      // Eco/duplicata checados FORA do updater: updaters devem ser puros
      // (StrictMode os invoca 2x → recibos/notificações/unread duplicados).
      const current = messagesRef.current
      if (isLikelyEcho(frame.raw, current, frame.timestamp)) return
      if (frame.msgId && current.some((m) => m.id === frame.msgId)) return

      const incomingId = frame.msgId ?? crypto.randomUUID()
      const base = { id: incomingId, sender: 'remote' as const, timestamp: frame.timestamp }
      const incomingMessage: WsChatMessage =
        frame.kind === 'text'
          ? { ...base, type: 'text', content: frame.content }
          : {
              ...base,
              type: 'file',
              filename: frame.filename,
              mime_type: frame.mime_type,
              file_data: frame.file_data,
            }

      // Ref já atualizado: frames seguidos podem chegar antes do re-render.
      messagesRef.current = [...current, incomingMessage]
      setMessages((prev) =>
        prev.some((m) => m.id === incomingId) ? prev : [...prev, incomingMessage],
      )
      acknowledgeIncoming(incomingId)
      onRemoteMessageRef.current?.(incomingMessage)
    }

    const handleIncomingPayload = (payload: string) => {
      resetIdle()
      setStatus((s) => (s === 'idle' ? 'connected' : s))

      const frame = parseIncoming(payload)
      if (!frame) return

      if (frame.msgId && pendingIds.current.has(frame.msgId)) {
        pendingIds.current.delete(frame.msgId)
        return
      }

      switch (frame.kind) {
        case 'identity':
          if (participantRole === 'tech' && frame.role === 'user' && frame.displayName.length > 0) {
            onRemoteClientIdentityRef.current?.(frame.displayName.slice(0, 128))
          }
          return
        case 'presence':
          if (frame.role !== participantRole && frame.presence) {
            onPresenceChangeRef.current?.(frame.presence)
          }
          // Técnico entrou depois: reanunciar login Windows (broadcast não guarda histórico).
          if (participantRole === 'user' && frame.role === 'tech') {
            void sendClientIdentityIfUser()
          }
          return
        // O outro lado encerrou o atendimento → fecha a conversa deste lado.
        case 'session_end':
          if (frame.role !== participantRole) onSessionEndRef.current?.()
          return
        // Recibo de entrega/leitura das MINHAS mensagens.
        case 'receipt':
          setMessages((prev) => applyReceipt(prev, frame.ids, frame.state))
          return
        // Indicador "digitando" do outro lado (com expiração de segurança).
        case 'typing':
          if (frame.role !== participantRole) handleRemoteTyping(frame.isStart)
          return
        case 'text':
        case 'file':
          handleChatMessage(frame)
          return
        default:
          return
      }
    }

    const scheduleReconnect = (code?: number) => {
      clearTimer(idleTimerRef)
      clearTimer(watchdogTimerRef)
      setStatus('disconnected')

      if (intentionalRef.current) return

      // 4003 (sala cheia/fantasma) e 4404 (sala sumiu durante reconexão do técnico)
      // são TRANSITÓRIOS: com o heartbeat do servidor, o socket morto cai em ~50s e
      // a vaga libera. Reconecta com backoff, mas com teto próprio para não girar
      // eternamente se a sala realmente acabou.
      const transient = code === 4003 || code === 4404
      let counter: number

      if (transient) {
        if (roomGoneRetriesRef.current >= ROOM_GONE_MAX_RETRIES) {
          setLastError(
            code === 4003
              ? 'A sala parece ocupada. Peça ao técnico para reabrir o chat.'
              : 'A sessão de chat foi encerrada. Peça um novo convite ao técnico.',
          )
          return
        }
        counter = roomGoneRetriesRef.current
        roomGoneRetriesRef.current++
      } else {
        if (retriesRef.current >= maxRetries) return
        counter = retriesRef.current
        retriesRef.current++
      }

      const delay = BACKOFF_DELAYS[Math.min(counter, BACKOFF_DELAYS.length - 1)]
      clearTimer(reconnectTimerRef)
      reconnectTimerRef.current = setTimeout(() => {
        void connect()
      }, delay)
    }

    // Eventos de um socket desta execução que chegam depois do cleanup (ex.: o
    // onclose assíncrono do navegador após trocar wsUrl) não podem mexer no
    // socketRef nem reagendar reconexão: o socket ativo já é de outra execução.
    const live = <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        if (!cancelled) fn(...args)
      }

    const handlers: ChatSocketHandlers = {
      onOpen: live((socket: ChatSocket) => {
        socketRef.current = socket
        retriesRef.current = 0
        roomGoneRetriesRef.current = 0
        setStatus('connected')
        setLastError(null)
        resetIdle()
        // Só o nativo tem watchdog (o navegador detecta queda sozinho).
        if (socket.kind === 'native') armWatchdog()
        emitPresence(latestPresenceRef.current)
        void sendClientIdentityIfUser()
      }),
      onText: live(handleIncomingPayload),
      onActivity: live(armWatchdog),
      // Navegador fecha logo após o erro (dispara onClose → scheduleReconnect).
      onError: live(() => setStatus('disconnected')),
      onClose: live((code?: number) => {
        socketRef.current = null
        scheduleReconnect(code)
      }),
    }

    async function connect() {
      if (intentionalRef.current) return
      if (!wsUrl || !roomId) {
        setStatus('disconnected')
        return
      }

      setStatus('connecting')

      try {
        if (shouldUseNativeSocket()) {
          await connectNativeSocket(wsUrl, handlers, isStale)
          return
        }
      } catch {
        socketRef.current = null
      }

      if (isStale()) return
      setStatus('connecting')
      socketRef.current = connectBrowserSocket(wsUrl, handlers)
    }

    void connect()

    const cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - PENDING_TTL_MS
      for (const [id, ts] of pendingIds.current) {
        if (ts < cutoff) pendingIds.current.delete(id)
      }
    }, PENDING_TTL_MS)

    return () => {
      cancelled = true
      intentionalRef.current = true
      clearTimer(idleTimerRef)
      clearTimer(reconnectTimerRef)
      clearTimer(watchdogTimerRef)
      emitPresence('offline')
      dropSocket()
      clearInterval(cleanupInterval)
    }
  }, [roomId, wsUrl, maxRetries, participantRole, dropSocket, clearRemoteTyping, handleRemoteTyping])

  useEffect(() => {
    latestPresenceRef.current = presenceState
    if (status === 'connected' || status === 'idle') {
      sendQuietly(socketRef.current, presenceFrame(participantRole, presenceState, Date.now()))
    }
  }, [participantRole, presenceState, status])

  const reportError = useCallback((error: string, type: 'text' | 'file') => {
    setLastError(error)
    onMessageErrorRef.current?.(error, type)
  }, [])

  /** Falso (e erro reportado) se não há socket pronto para enviar. */
  const ensureConnected = useCallback((type: 'text' | 'file') => {
    if (socketRef.current?.isOpen()) return true
    reportError('Não conectado ao chat', type)
    return false
  }, [reportError])

  /**
   * Envia o payload de uma mensagem própria e resolve 'sending' → 'sent' | 'failed'.
   * No socket nativo o envio é assíncrono: só vira 'sent' quando a promise resolve.
   */
  const deliverPayload = useCallback(
    (msgId: string, payload: string, onError: (error: unknown) => void) => {
      const settle = (next: 'sent' | 'failed') =>
        setMessages((prev) => setMessageStatus(prev, msgId, next, 'sending'))
      const fail = (error: unknown) => {
        settle('failed')
        onError(error)
      }
      try {
        const socket = socketRef.current
        if (!socket) throw new Error('offline')
        const pending = socket.send(payload)
        if (pending) pending.then(() => settle('sent'), fail)
        else settle('sent')
      } catch (error) {
        fail(error)
      }
    },
    [],
  )

  /** Caminho comum de sendText/sendFile: mensagem otimista + envio. */
  const sendOwnMessage = useCallback((body: OwnBody) => {
    const id = crypto.randomUUID()
    const timestamp = Date.now()
    const msg: WsChatMessage = { ...body, id, sender: 'me', timestamp, status: 'sending' }
    pendingIds.current.set(id, timestamp)
    setMessages((prev) => [...prev, msg])
    const what = body.type === 'text' ? 'mensagem' : 'arquivo'
    deliverPayload(id, JSON.stringify(outgoingFrame(msg)), (error) => {
      reportError(`Erro ao enviar ${what}: ${errorText(error)}`, body.type)
    })
  }, [deliverPayload, reportError])

  const sendText = useCallback((content: string) => {
    if (!ensureConnected('text')) return
    setLastError(null)

    let processedContent = content
    if (enableLanguageFilter) {
      const filterResult = processMessageWithFilter(content, {
        ...DEFAULT_FILTER_SETTINGS,
        enabled: true,
        showWarningMessage: true,
        blockMessage: false, // Don't block, just filter
      })

      if (filterResult.shouldBlock) {
        reportError('Mensagem bloqueada: contém linguagem inadequada', 'text')
        return
      }

      processedContent = filterResult.filteredText

      if (filterResult.isFiltered && filterResult.warningMessage) {
        onMessageErrorRef.current?.(filterResult.warningMessage, 'text')
      }
    }

    sendOwnMessage({ type: 'text', content: processedContent })
  }, [enableLanguageFilter, ensureConnected, reportError, sendOwnMessage])

  const sendFile = useCallback(
    (filename: string, mime_type: string, file_data: string) => {
      try {
        if (!ensureConnected('file')) return
        setLastError(null)

        // Validações de tamanho/nome/extensão centralizadas no protocolo.
        const validation = validateOutgoingFile(filename, file_data)
        if (!validation.ok) {
          reportError(validation.error, 'file')
          return
        }

        sendOwnMessage({ type: 'file', filename, mime_type, file_data })
      } catch (error) {
        reportError(`Erro ao enviar arquivo: ${errorText(error)}`, 'file')
      }
    },
    [ensureConnected, reportError, sendOwnMessage],
  )

  const disconnect = useCallback(() => {
    intentionalRef.current = true
    clearTimer(idleTimerRef)
    clearTimer(reconnectTimerRef)
    clearTimer(watchdogTimerRef)
    dropSocket()
    setStatus('disconnected')
  }, [dropSocket])

  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter(msg => msg.id !== messageId))
  }, [])

  const clearError = useCallback(() => {
    setLastError(null)
  }, [])

  /** Confirma leitura das mensagens recebidas pendentes (chamar quando a janela fica ativa). */
  const markRead = useCallback(() => {
    if (unreadIncomingRef.current.size === 0) return
    const ids = Array.from(unreadIncomingRef.current)
    unreadIncomingRef.current.clear()
    sendControl(receiptFrame('read', ids, Date.now()))
  }, [sendControl])

  /** Reenvia uma mensagem própria que falhou. */
  const retryMessage = useCallback((id: string) => {
    const msg = messagesRef.current.find((m) => m.id === id && m.sender === 'me')
    if (!msg) return
    setMessages((prev) => setMessageStatus(prev, id, 'sending'))
    pendingIds.current.set(id, Date.now())
    deliverPayload(id, JSON.stringify(outgoingFrame(msg)), (error) => {
      setLastError(`Erro ao reenviar mensagem: ${errorText(error)}`)
    })
  }, [deliverPayload])

  /** Encerra o atendimento: avisa o outro lado para fechar a conversa. */
  const endSession = useCallback(() => {
    sendControl(sessionEndFrame(participantRole, Date.now()))
  }, [sendControl, participantRole])

  /** Semeia o histórico carregado do disco (sobrevive a reconexões). */
  const seedHistory = useCallback((history: WsChatMessage[]) => {
    initialMessagesRef.current = history
    if (history.length === 0) return
    setMessages((prev) => {
      const histIds = new Set(history.map((m) => m.id))
      return [...history, ...prev.filter((m) => !histIds.has(m.id))]
    })
  }, [])

  return {
    messages,
    sendText,
    sendFile,
    status,
    disconnect,
    deleteMessage,
    lastError,
    clearError,
    remoteTyping,
    notifyTyping,
    stopTyping,
    markRead,
    retryMessage,
    seedHistory,
    endSession,
  }
}
