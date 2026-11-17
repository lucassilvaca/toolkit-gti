import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TerminalModal } from '../shared/components/TerminalModal';

Element.prototype.scrollIntoView = vi.fn(); // jsdom não implementa

const base = { open: true, title: 'Netstat -an', onClose: vi.fn(), onStop: vi.fn() };

describe('TerminalModal', () => {
  it('shows a loader while a non-streaming command runs', () => {
    render(<TerminalModal {...base} lines={[]} isStreaming={false} isRunning />);
    expect(screen.getByText(/a saída aparece ao terminar/)).toBeInTheDocument();
    expect(screen.getByText(/Executando… 0s/)).toBeInTheDocument();
    expect(screen.queryByText(/sem saída/i)).not.toBeInTheDocument();
  });

  it('shows the error when the command fails', () => {
    render(<TerminalModal {...base} lines={[]} isStreaming={false} error="Acesso negado" />);
    expect(screen.getByText(/Acesso negado/)).toBeInTheDocument();
    expect(screen.getByText('Falhou')).toBeInTheDocument();
  });
});
