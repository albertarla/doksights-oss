import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebManualViewer } from './WebManualViewer';
import { supabase } from '@/integrations/supabase/client';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock child components and libraries
vi.mock('react-markdown', () => ({
  default: ({ children }: any) => <div data-testid="markdown-content">{children}</div>,
}));
vi.mock('remark-gfm', () => ({ default: {} }));

vi.mock('@/components/pdf-viewer/AIChatPanel', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="ai-chat-panel" data-open={isOpen} />
  ),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

const defaultManual = {
  id: 'm1',
  title: 'Web Guide',
  description: 'Web manual description',
  manualType: 'web' as const,
  pageCount: 2,
  folderId: null,
  displayOrder: 1,
  createdAt: '2023-01-01T00:00:00Z',
};

const mockSections = [
  { id: 's1', title: 'Introduction', content: 'Intro content', display_order: 0 },
  { id: 's2', title: 'Installation', content: 'Install content', display_order: 1 },
];

describe('WebManualViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.from as any).mockImplementation(() => {
      const prom = Promise.resolve({ data: mockSections, error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: prom.then.bind(prom),
      };
    });
  });

  it('renders manual title and sections in navigation', async () => {
    render(
      <WebManualViewer
        manual={defaultManual}
        onBack={vi.fn()}
        companyName="Acme Corp"
      />
    );

    expect(screen.getAllByText('Web Guide').length).toBeGreaterThan(0);
    await waitFor(() => {
      // Use getAllByText because title appears in sidebar AND as h1
      expect(screen.getAllByText('Introduction').length).toBeGreaterThan(0);
      expect(screen.getByText('Installation')).toBeInTheDocument();
    });
  });

  it('switches content when a section is clicked', async () => {
    render(
      <WebManualViewer
        manual={defaultManual}
        onBack={vi.fn()}
        companyName="Acme Corp"
      />
    );

    await waitFor(() => expect(screen.getByText('Installation')).toBeInTheDocument());
    
    // Initial content should be first section
    await waitFor(() => expect(screen.getByTestId('markdown-content')).toHaveTextContent('Intro content'));

    // Click second section in sidebar (it's a button)
    const installButton = screen.getByRole('button', { name: /Installation/i });
    fireEvent.click(installButton);
    await waitFor(() => expect(screen.getByTestId('markdown-content')).toHaveTextContent('Install content'));
  });

  it('toggles AI Chat panel', async () => {
    render(
      <WebManualViewer
        manual={defaultManual}
        onBack={vi.fn()}
        companyName="Acme Corp"
      />
    );

    // Initial state: not in document (conditional rendering)
    expect(screen.queryByTestId('ai-chat-panel')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('AI Chat')).toBeInTheDocument());
    fireEvent.click(screen.getByText('AI Chat'));

    await waitFor(() => {
      expect(screen.getByTestId('ai-chat-panel')).toBeInTheDocument();
    });
  });

  it('navigates between sections via sidebar and verifies content changes', async () => {
    const sectionsWithLink = [
      { id: 's1', title: 'Introduction', content: 'See Installation section for details.', display_order: 0 },
      { id: 's2', title: 'Installation', content: 'Install content here.', display_order: 1 },
    ];

    (supabase.from as any).mockImplementation(() => {
      const prom = Promise.resolve({ data: sectionsWithLink, error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: prom.then.bind(prom),
      };
    });

    render(
      <WebManualViewer
        manual={defaultManual}
        onBack={vi.fn()}
        companyName="Acme Corp"
      />
    );

    // First section is active — its content is displayed
    await waitFor(() => expect(screen.getByTestId('markdown-content')).toHaveTextContent('See Installation section for details.'));

    // Click the Installation section in the sidebar
    const installationBtn = await screen.findByRole('button', { name: /installation/i });
    fireEvent.click(installationBtn);

    // Second section content should now be displayed
    await waitFor(() => expect(screen.getByTestId('markdown-content')).toHaveTextContent('Install content here.'));
  });
});
