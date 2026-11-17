import { useState, useEffect, useCallback, useRef } from 'react';
import type { WsChatMessage } from '../../../shared/types/chat';

interface NotificationOptions {
  techName?: string;
  /** Nome do participante remoto (ex.: login Windows), para título quando o técnico recebe mensagem do usuário. */
  remotePeerName?: string;
  avatar?: string;
  enabled?: boolean;
}

interface UseChatNotificationsOptions extends NotificationOptions {
  onPermissionChange?: (permission: NotificationPermission) => void;
}

export function useChatNotifications({
  techName = 'Técnico',
  remotePeerName = '',
  avatar,
  enabled = true,
  onPermissionChange
}: UseChatNotificationsOptions = {}) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const activeNotifications = useRef<Notification[]>([]);
  // Ref espelha o estado: o efeito de listeners não depende dele (senão o
  // primeiro clique re-inscreveria tudo e o cleanup limparia as notificações).
  const hasUserInteractedRef = useRef(false);

  // Clear all active notifications
  const clearAllNotifications = useCallback(() => {
    activeNotifications.current.forEach(notification => {
      notification.close();
    });
    activeNotifications.current = [];
  }, []);

  // Check initial permission and setup focus listeners
  useEffect(() => {
    // Check notification support
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return;
    }

    setPermission(Notification.permission);

    // Focus/Blur listeners
    const handleFocus = () => {
      setIsWindowFocused(true);
      clearAllNotifications();
    };

    const handleBlur = () => {
      setIsWindowFocused(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setIsWindowFocused(true);
        clearAllNotifications();
      } else {
        setIsWindowFocused(false);
      }
    };

    // Track user interaction for permission request
    const handleUserInteraction = () => {
      if (!hasUserInteractedRef.current) {
        hasUserInteractedRef.current = true;
        setHasUserInteracted(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      clearAllNotifications();
    };
  }, [clearAllNotifications]);

  // Request permission elegantly
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      return false;
    }

    // Only request if user has interacted with the page
    if (!hasUserInteractedRef.current) {
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      onPermissionChange?.(result);
      return result === 'granted';
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }, [onPermissionChange]);

  // Show notification for new message
  const showMessageNotification = useCallback(async (message: WsChatMessage) => {
    if (!enabled || isWindowFocused || message.sender === 'me') {
      return;
    }

    const hasPermission = permission === 'granted' || await requestPermission();
    if (!hasPermission) {
      return;
    }

    try {
      // Narrow pela discriminante da union: no ramo 'file', `message` é
      // FileMessage e expõe `filename` com type safety (sem `as any`).
      const content =
        message.type === 'file'
          ? `📎 Enviou um arquivo: ${message.filename}`
          : message.content;

      const senderLabel =
        message.senderInfo?.name?.trim() ||
        remotePeerName.trim() ||
        techName;

      const notification = new Notification(
        `💬 Nova mensagem de ${senderLabel}`,
        {
          body: content.length > 100 ? content.substring(0, 100) + '...' : content,
          icon: avatar || '/icons/chat-notification.png',
          badge: '/icons/chat-badge.png',
          tag: `chat-message-${message.id}`,
          requireInteraction: false,
          silent: false,
          data: {
            messageId: message.id,
            timestamp: message.timestamp,
            type: message.type
          }
        }
      );

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      notification.onclose = () => {
        const index = activeNotifications.current.indexOf(notification);
        if (index > -1) {
          activeNotifications.current.splice(index, 1);
        }
      };

      notification.onerror = (error) => {
        console.error('Notification error:', error);
      };

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      activeNotifications.current.push(notification);

    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  }, [enabled, isWindowFocused, permission, techName, remotePeerName, avatar, requestPermission]);

  // Show typing notification
  const showTypingNotification = useCallback(async () => {
    if (!enabled || isWindowFocused) return;

    const hasPermission = permission === 'granted' || await requestPermission();
    if (!hasPermission) return;

    try {
      const notification = new Notification(
        `✍️ ${techName} está digitando...`,
        {
          body: 'Uma resposta está sendo preparada para você',
          icon: avatar || '/icons/chat-notification.png',
          tag: 'typing-indicator',
          requireInteraction: false,
          silent: true
        }
      );

      setTimeout(() => notification.close(), 3000);
      activeNotifications.current.push(notification);

    } catch (error) {
      console.error('Failed to show typing notification:', error);
    }
  }, [enabled, isWindowFocused, permission, techName, avatar, requestPermission]);

  const showStatusNotification = useCallback(async (title: string, body: string) => {
    if (!enabled || isWindowFocused) return;
    const hasPermission = permission === 'granted' || await requestPermission();
    if (!hasPermission) return;

    try {
      const notification = new Notification(title, {
        body,
        icon: avatar || '/icons/chat-notification.png',
        tag: `chat-status-${title}`,
        requireInteraction: false,
      });
      notification.onclick = () => { window.focus(); notification.close(); };
      setTimeout(() => notification.close(), 5000);
      activeNotifications.current.push(notification);
    } catch (error) {
      console.error('Failed to show chat status notification:', error);
    }
  }, [enabled, isWindowFocused, permission, avatar, requestPermission]);

  return {
    permission,
    isWindowFocused,
    hasUserInteracted,
    requestPermission,
    showMessageNotification,
    showStatusNotification,
    showTypingNotification,
    clearAllNotifications
  };
}
