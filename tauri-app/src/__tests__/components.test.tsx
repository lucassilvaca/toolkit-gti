import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const Icon = ({ size, className, ...props }: Record<string, unknown>) => (
    <span data-testid="mock-icon" data-size={size} className={className as string} {...props}>icon</span>
  );
  return {
    Info: Icon,
    Copy: Icon,
    Check: Icon,
    LayoutGrid: Icon,
    Compass: Icon,
    FileText: Icon,
    Wrench: Icon,
    Bell: Icon,
    MessageSquare: Icon,
  };
});

// Mock motion/react
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => <div {...props as React.HTMLAttributes<HTMLDivElement>}>{children as React.ReactNode}</div>,
  },
}));


describe('StatusAlert', () => {
  it('should return null when status is null', async () => {
    const { StatusAlert } = await import('../shared/components/StatusAlert');
    const { container } = render(<StatusAlert status={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render success status with check mark', async () => {
    const { StatusAlert } = await import('../shared/components/StatusAlert');
    render(<StatusAlert status={{ ok: true, msg: 'Success!' }} />);
    expect(screen.getByText('Success!')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('should render error status with X mark', async () => {
    const { StatusAlert } = await import('../shared/components/StatusAlert');
    render(<StatusAlert status={{ ok: false, msg: 'Failed!' }} />);
    expect(screen.getByText('Failed!')).toBeInTheDocument();
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('should apply success styling when ok', async () => {
    const { StatusAlert } = await import('../shared/components/StatusAlert');
    const { container } = render(<StatusAlert status={{ ok: true, msg: 'ok' }} />);
    expect(container.firstChild).toHaveClass('text-success');
  });

  it('should apply error styling when not ok', async () => {
    const { StatusAlert } = await import('../shared/components/StatusAlert');
    const { container } = render(<StatusAlert status={{ ok: false, msg: 'err' }} />);
    expect(container.firstChild).toHaveClass('text-danger');
  });
});

// ─── PrimaryButton ────────────────────────────────────────────────────────────

describe('PrimaryButton', () => {
  it('should render children text', async () => {
    const { PrimaryButton } = await import('../shared/components/PrimaryButton');
    render(<PrimaryButton>Click me</PrimaryButton>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', async () => {
    const { PrimaryButton } = await import('../shared/components/PrimaryButton');
    render(<PrimaryButton disabled>Disabled</PrimaryButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should be disabled when loading', async () => {
    const { PrimaryButton } = await import('../shared/components/PrimaryButton');
    render(<PrimaryButton loading>Submit</PrimaryButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should show default loading text when loading', async () => {
    const { PrimaryButton } = await import('../shared/components/PrimaryButton');
    render(<PrimaryButton loading>Submit</PrimaryButton>);
    expect(screen.getByText('Aguarde...')).toBeInTheDocument();
  });

  it('should show custom loading text', async () => {
    const { PrimaryButton } = await import('../shared/components/PrimaryButton');
    render(<PrimaryButton loading loadingText="Salvando...">Submit</PrimaryButton>);
    expect(screen.getByText('Salvando...')).toBeInTheDocument();
  });

  it('should call onClick when clicked', async () => {
    const { PrimaryButton } = await import('../shared/components/PrimaryButton');
    const onClick = vi.fn();
    render(<PrimaryButton onClick={onClick}>Click</PrimaryButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

// ─── FormField ────────────────────────────────────────────────────────────────

describe('FormField', () => {
  it('should render label text', async () => {
    const { FormField } = await import('../shared/components/FormField');
    render(<FormField label="Username"><input /></FormField>);
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  it('should render children', async () => {
    const { FormField } = await import('../shared/components/FormField');
    render(<FormField label="Test"><input data-testid="child-input" /></FormField>);
    expect(screen.getByTestId('child-input')).toBeInTheDocument();
  });

  it('should render labelRight when provided', async () => {
    const { FormField } = await import('../shared/components/FormField');
    render(
      <FormField label="Field" labelRight={<span>Optional</span>}>
        <input />
      </FormField>
    );
    expect(screen.getByText('Optional')).toBeInTheDocument();
  });
});

// ─── Input & Textarea ─────────────────────────────────────────────────────────

describe('Input', () => {
  it('should render an input element', async () => {
    const { Input } = await import('../shared/components/Input');
    render(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('should accept value changes', async () => {
    const { Input } = await import('../shared/components/Input');
    const onChange = vi.fn();
    render(<Input onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('should be disabled when disabled prop is set', async () => {
    const { Input } = await import('../shared/components/Input');
    render(<Input disabled placeholder="disabled" />);
    expect(screen.getByPlaceholderText('disabled')).toBeDisabled();
  });
});

describe('Textarea', () => {
  it('should render a textarea element', async () => {
    const { Textarea } = await import('../shared/components/Input');
    render(<Textarea placeholder="Write here" />);
    expect(screen.getByPlaceholderText('Write here')).toBeInTheDocument();
  });

  it('should have resize-none class', async () => {
    const { Textarea } = await import('../shared/components/Input');
    render(<Textarea placeholder="ta" />);
    expect(screen.getByPlaceholderText('ta')).toHaveClass('resize-none');
  });
});

// ─── InfoBanner ───────────────────────────────────────────────────────────────

describe('InfoBanner', () => {
  it('should render title and description', async () => {
    const { Info } = await import('lucide-react');
    const { InfoBanner } = await import('../shared/components/InfoBanner');
    render(<InfoBanner icon={Info} title="Title" description="Description text" />);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description text')).toBeInTheDocument();
  });

  it('should apply cyan variant by default', async () => {
    const { Info } = await import('lucide-react');
    const { InfoBanner } = await import('../shared/components/InfoBanner');
    const { container } = render(<InfoBanner icon={Info} title="T" description="D" />);
    expect(container.firstChild).toHaveClass('border-line-strong');
  });

  it('should apply neutral variant', async () => {
    const { Info } = await import('lucide-react');
    const { InfoBanner } = await import('../shared/components/InfoBanner');
    const { container } = render(
      <InfoBanner icon={Info} title="T" description="D" variant="neutral" />
    );
    expect(container.firstChild).toHaveClass('border-line');
  });
});

// ─── InfoBanner end ─────────────────────────────────────────────────────────
