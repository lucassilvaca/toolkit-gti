import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// ─── Sidebar (recolher) ───────────────────────────────────────────────────────

describe('Sidebar collapse', () => {
  const props = {
    systemInfo: { username: 'joao.silva' } as never,
    activeTab: 'dashboard' as never,
    unreadChat: 3,
    isAdmin: false,
    onTabChange: vi.fn(),
    onLogout: vi.fn(),
  };

  it('hides labels, keeps accessible names and persists the choice', async () => {
    localStorage.removeItem('sidebar-collapsed');
    const { Sidebar } = await import('../shared/components/Sidebar');
    const { unmount } = render(<Sidebar {...props} />);
    expect(screen.getByText('Toolkit')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Recolher menu/ }));

    expect(screen.queryByText('Toolkit')).not.toBeInTheDocument();
    expect(screen.queryByText('joao.silva')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /não lidas/ })).toHaveAttribute('title');
    expect(localStorage.getItem('sidebar-collapsed')).toBe('1');

    unmount();
    render(<Sidebar {...props} />);
    expect(screen.getByRole('button', { name: 'Expandir menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});
