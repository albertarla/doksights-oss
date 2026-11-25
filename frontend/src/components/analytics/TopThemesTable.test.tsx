import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TopThemesTable, type ChatTheme } from './TopThemesTable';

describe('TopThemesTable', () => {
  it('shows a spinner while loading', () => {
    const { container } = render(
      <TopThemesTable 
        themes={[]} 
        isLoading={true} 
        currentPage={0} 
        hasMore={false} 
        onPageChange={vi.fn()} 
      />
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no themes and not loading', () => {
    render(
      <TopThemesTable 
        themes={[]} 
        isLoading={false} 
        currentPage={0} 
        hasMore={false} 
        onPageChange={vi.fn()} 
      />
    );
    expect(screen.getByText(/No themes identified/i)).toBeInTheDocument();
  });

  it('renders themes sorted by session_count descending', () => {
    const themes: ChatTheme[] = [
      { id: '1', label: 'Generic Question', title: 'Password Reset Issues', session_count: 5 },
      { id: '2', label: 'Bug / Troubleshooting', title: 'App crashes on login', session_count: 12 },
      { id: '3', label: 'Change Request', title: 'Need dark mode', session_count: 3 },
    ];
    render(
      <TopThemesTable 
        themes={themes} 
        isLoading={false} 
        currentPage={0} 
        hasMore={false} 
        onPageChange={vi.fn()} 
      />
    );

    const rows = screen.getAllByRole('row');
    // rows[0] = header, rows[1] = first data row (highest count)
    expect(rows[1]).toHaveTextContent('App crashes on login');
    expect(rows[1]).toHaveTextContent('12');
    expect(rows[2]).toHaveTextContent('Password Reset Issues');
    expect(rows[3]).toHaveTextContent('Need dark mode');
  });

  it('renders rank numbers', () => {
    const themes: ChatTheme[] = [
      { id: '1', label: 'Generic Question', title: 'Some theme', session_count: 42 },
    ];
    render(
      <TopThemesTable 
        themes={themes} 
        isLoading={false} 
        currentPage={0} 
        hasMore={false} 
        onPageChange={vi.fn()} 
      />
    );
    // Rank number '1' should be visible in the first data row
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('calculates rank numbers based on page', () => {
    const themes: ChatTheme[] = [
      { id: '10', label: 'Generic Question', title: 'Page 2 theme', session_count: 10 },
    ];
    render(
      <TopThemesTable 
        themes={themes} 
        isLoading={false} 
        currentPage={1} 
        hasMore={false} 
        onPageChange={vi.fn()} 
      />
    );
    // On page 2 (idx 1), the rank should be 1 + 1*5 = 6
    expect(screen.getByText('6')).toBeInTheDocument();
  });
});
