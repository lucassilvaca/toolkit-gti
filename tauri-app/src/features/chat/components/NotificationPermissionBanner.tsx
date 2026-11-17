import { useState } from 'react';
import { Bell, X, Check } from 'lucide-react';

interface NotificationPermissionBannerProps {
  permission: NotificationPermission;
  onRequestPermission: () => Promise<boolean>;
  onDismiss?: () => void;
  techName?: string;
}

export function NotificationPermissionBanner({
  permission,
  onRequestPermission,
  onDismiss,
  techName = 'técnico'
}: NotificationPermissionBannerProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  if (permission === 'granted' || permission === 'denied' || isDismissed) {
    return null;
  }

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    try {
      await onRequestPermission();
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  return (
    <div className="mx-4 mb-4 p-4 bg-gradient-to-r from-accent/10 to-accent/10 border border-accent/20 rounded-[6px]">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 p-2 bg-accent/20 rounded-lg">
          <Bell size={20} className="text-accent-soft" />
        </div>

        <div className="flex-1">
          <h4 className="font-semibold text-ink-strong text-sm mb-1">
            Receba notificações em tempo real
          </h4>
          <p className="text-xs text-ink leading-relaxed mb-3">
            Ative as notificações para ser avisado instantaneamente quando o {techName} enviar uma mensagem,
            mesmo se você estiver em outra aba ou aplicativo.
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRequestPermission}
              disabled={isRequesting}
              className="focus-ring flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-soft disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {isRequesting ? (
                <>
                  <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  Solicitando...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Ativar Notificações
                </>
              )}
            </button>

            <button
              onClick={handleDismiss}
              className="flex items-center gap-2 px-3 py-2 text-ink-muted hover:text-ink text-xs font-medium transition-colors"
            >
              Agora não
            </button>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 text-ink-faint hover:text-ink transition-colors"
          title="Fechar"
        >
          <X size={16} />
        </button>
      </div>

      {/* Benefits list */}
      <div className="mt-3 pt-3 border-t border-accent/10">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-ink-muted">
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-accent-soft rounded-full" />
            <span>Respostas mais rápidas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-accent-soft rounded-full" />
            <span>Não perca mensagens importantes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-accent-soft rounded-full" />
            <span>Funciona mesmo em outras abas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-accent-soft rounded-full" />
            <span>Você controla quando receber</span>
          </div>
        </div>
      </div>
    </div>
  );
}
