import { motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalShellProps {
  onClose: () => void;
  maxWidth?: string;
  children: ReactNode;
}

/**
 * Âncora padrão para todos os modais da aplicação.
 * Garante posicionamento, backdrop e animação de entrada/saída idênticos.
 *
 * Renderiza via portal no <body>: as views ficam dentro de `motion.div` com
 * transform (scale/translate), que vira o bloco de contenção de `position: fixed`
 * — sem o portal o modal ficava preso à área de conteúdo e atrás do menu lateral.
 */
export function ModalShell({ onClose, maxWidth = "max-w-lg", children }: ModalShellProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 cursor-pointer bg-[rgba(19,32,30,0.28)] backdrop-blur-[3px]"
        onClick={onClose}
      />

      {/* Wrapper rolável: centraliza quando cabe, rola quando é mais alto que a tela */}
      <div className="pointer-events-none flex min-h-full items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={`pointer-events-auto relative z-10 my-4 w-full ${maxWidth}`}
        >
          {children}
        </motion.div>
      </div>
    </div>,
    document.body,
  );
}
