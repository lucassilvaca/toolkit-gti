import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

const user = {
  ip: '10.20.30.129', hostname: '', username: '', online: true,
  has_toolkit: false, uptime_secs: null, last_seen: null,
};

async function clickPing(onNotifyErr: (m: string) => void) {
  const { OnlineUserRow } = await import('../features/presence/components/OnlineUserRow');
  render(
    <table><tbody>
      <OnlineUserRow user={user} onCall={() => {}} calling={false} onNotifyOk={() => {}} onNotifyErr={onNotifyErr} />
    </tbody></table>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ações para 10.20.30.129' }));
  fireEvent.click(await screen.findByText('Testar conexão (ping)'));
}

describe('OnlineUserRow ping', () => {
  it('sessão expirada mostra o motivo, não "sem resposta"', { timeout: 20_000 }, async () => {
    invoke.mockRejectedValue({ message: 'Autenticação necessária. Faça login para continuar', code: 'AUTH_REQUIRED' });
    const onNotifyErr = vi.fn();
    await clickPing(onNotifyErr);
    await waitFor(() => expect(onNotifyErr).toHaveBeenCalledWith(expect.stringContaining('AUTH_REQUIRED')));
    expect(screen.queryByText(/sem resposta/)).not.toBeInTheDocument();
  });

  it('ping que rodou e falhou continua "sem resposta"', async () => {
    invoke.mockResolvedValue({ success: false, output: 'Esgotado o tempo limite do pedido.', error: null });
    const onNotifyErr = vi.fn();
    await clickPing(onNotifyErr);
    expect(await screen.findByText('✗ sem resposta')).toBeInTheDocument();
    expect(onNotifyErr).not.toHaveBeenCalled();
  });
});
