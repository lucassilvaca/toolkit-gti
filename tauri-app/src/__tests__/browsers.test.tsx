import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

describe('BrowsersView', () => {
  // 1º teste paga o import a frio da view (transform do Vite); com a CPU
  // ocupada (ex.: cargo build em paralelo) passava dos 5 s padrão.
  it('lists browsers returned by get_browser_info', { timeout: 20_000 }, async () => {
    invoke.mockResolvedValue({
      browsers: [
        { name: 'Google Chrome', version: '155.0.8059.84' },
        { name: 'Brave', version: '155.1.97.59' },
      ],
      defaultBrowser: 'Brave',
    });
    const { BrowsersView } = await import('../features/browser/views/BrowsersView');
    render(<BrowsersView />);
    expect(await screen.findByText('Google Chrome')).toBeInTheDocument();
    expect(screen.getByText('v155.1.97.59')).toBeInTheDocument();
  });
});

describe('BrowsersView error', () => {
  it('shows the backend error instead of an empty list', async () => {
    invoke.mockRejectedValue({ message: 'Sessão expirada', code: 'AUTH_REQUIRED' });
    const { BrowsersView } = await import('../features/browser/views/BrowsersView');
    render(<BrowsersView />);
    expect(await screen.findByText(/Sessão expirada · AUTH_REQUIRED/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhum navegador detectado')).not.toBeInTheDocument();
  });
});
