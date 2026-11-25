import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ManualCard } from './ManualCard';

// Stub heavy dropdown/select Radix primitives so jsdom renders them inline
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
}));

const baseManual = {
  id: 'manual-1',
  title: 'Test Guide',
  description: null,
  file_name: 'test.pdf',
  file_size: 1024,
  created_at: '2024-01-15T10:00:00Z',
  is_public: false,
};

const renderCard = (props: Partial<typeof baseManual & { rag_status?: string; description?: string | null; is_public?: boolean }> = {}) => {
  const manual = { ...baseManual, ...props };
  return render(
    <BrowserRouter>
      <ManualCard
        manual={manual as any}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    </BrowserRouter>
  );
};

describe('ManualCard', () => {
  it('renders the manual title', () => {
    renderCard();
    expect(screen.getByText('Test Guide')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    renderCard({ description: 'How to use the product' });
    expect(screen.getByText('How to use the product')).toBeInTheDocument();
  });

  it('does not render description section when null', () => {
    renderCard({ description: null });
    expect(screen.queryByText('How to use the product')).not.toBeInTheDocument();
  });

  it('formats file size in bytes correctly', () => {
    renderCard({ file_size: 512 });
    expect(screen.getByText('512 B')).toBeInTheDocument();
  });

  it('formats file size in KB correctly', () => {
    renderCard({ file_size: 2048 });
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('formats file size in MB correctly', () => {
    renderCard({ file_size: 2 * 1024 * 1024 });
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
  });

  it('renders the created date in readable format', () => {
    renderCard({ created_at: '2024-01-15T10:00:00Z' });
    expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
  });

  it('shows "Public" badge when is_public is true', () => {
    renderCard({ is_public: true });
    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('shows "Private" text when is_public is false', () => {
    renderCard({ is_public: false });
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('shows "AI Context: Ready" badge for completed rag_status', () => {
    renderCard({ rag_status: 'completed' });
    expect(screen.getByText('AI Context: Ready')).toBeInTheDocument();
  });

  it('shows "AI Context: Indexing..." badge for processing rag_status', () => {
    renderCard({ rag_status: 'processing' });
    expect(screen.getByText('AI Context: Indexing...')).toBeInTheDocument();
  });

  it('shows "AI Context: Failed" badge for failed rag_status', () => {
    renderCard({ rag_status: 'failed' });
    expect(screen.getByText('AI Context: Failed')).toBeInTheDocument();
  });

  it('shows "AI Context: Pending" badge for pending rag_status', () => {
    renderCard({ rag_status: 'pending' });
    expect(screen.getByText('AI Context: Pending')).toBeInTheDocument();
  });

  it('calls onEdit when Edit Details button is clicked', () => {
    const onEdit = vi.fn();
    render(
      <BrowserRouter>
        <ManualCard manual={baseManual as any} onEdit={onEdit} onDelete={vi.fn()} />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Edit Details'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when Delete button is clicked', () => {
    const onDelete = vi.fn();
    render(
      <BrowserRouter>
        <ManualCard manual={baseManual as any} onEdit={vi.fn()} onDelete={onDelete} />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
