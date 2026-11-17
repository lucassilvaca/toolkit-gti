import { useState, useRef, useEffect, useCallback } from 'react'
import { typingFrame } from '../services/chatFrames'

type Role = 'tech' | 'user'

const TYPING_THROTTLE_MS = 2000
const TYPING_AUTO_STOP_MS = 3000
const REMOTE_TYPING_EXPIRY_MS = 6000

/**
 * Indicador "digitando": envio próprio (throttle + auto-stop) e estado remoto
 * (com expiração de segurança). `sendControl` precisa ser estável.
 */
export function useTypingSignals(
  participantRole: Role,
  sendControl: (frame: Record<string, unknown>) => void,
) {
  const [remoteTyping, setRemoteTyping] = useState(false)
  const remoteTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingThrottleRef = useRef(0)
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Timers vivem fora do efeito de conexão → limpa no unmount.
  useEffect(() => () => {
    if (remoteTypingTimerRef.current) clearTimeout(remoteTypingTimerRef.current)
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current)
  }, [])

  /** Frame 'typing' do outro lado. */
  const handleRemoteTyping = useCallback((isStart: boolean) => {
    setRemoteTyping(isStart)
    if (remoteTypingTimerRef.current) clearTimeout(remoteTypingTimerRef.current)
    if (isStart) {
      remoteTypingTimerRef.current = setTimeout(() => setRemoteTyping(false), REMOTE_TYPING_EXPIRY_MS)
    }
  }, [])

  /** Chegou mensagem do outro lado → ele parou de digitar. */
  const clearRemoteTyping = useCallback(() => {
    setRemoteTyping(false)
    if (remoteTypingTimerRef.current) {
      clearTimeout(remoteTypingTimerRef.current)
      remoteTypingTimerRef.current = null
    }
  }, [])

  /** Avisa o outro lado que estou digitando (throttle 2s, auto-stop em 3s). */
  const notifyTyping = useCallback(() => {
    const now = Date.now()
    if (now - typingThrottleRef.current > TYPING_THROTTLE_MS) {
      typingThrottleRef.current = now
      sendControl(typingFrame(participantRole, 'start', now))
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current)
    typingStopTimerRef.current = setTimeout(() => {
      typingThrottleRef.current = 0
      sendControl(typingFrame(participantRole, 'stop', Date.now()))
    }, TYPING_AUTO_STOP_MS)
  }, [sendControl, participantRole])

  const stopTyping = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current)
      typingStopTimerRef.current = null
    }
    if (typingThrottleRef.current !== 0) {
      typingThrottleRef.current = 0
      sendControl(typingFrame(participantRole, 'stop', Date.now()))
    }
  }, [sendControl, participantRole])

  return { remoteTyping, notifyTyping, stopTyping, handleRemoteTyping, clearRemoteTyping }
}
