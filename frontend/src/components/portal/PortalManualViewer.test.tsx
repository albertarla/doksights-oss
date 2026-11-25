import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PortalManualViewer } from './PortalManualViewer';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';

// Keep the mocks simple so we don't render canvas or real PDF logic in jsdom
vi.mock('@/components/pdf-viewer/PDFControls', () => ({
  default: ({ onToggleSearch }: any) => (
    <div data-testid="pdf-controls">
      <button onClick={onToggleSearch}>Toggle Search</button>
    </div>
  ),
}));

vi.mock('@/components/pdf-viewer/PDFDocument', () => ({
  default: () => <div data-testid="pdf-document" />,
}));

vi.mock('@/components/pdf-viewer/PageThumbnails', () => ({
  default: () => <div data-testid="page-thumbnails" />,
}));

vi.mock('@/components/pdf-viewer/AIChatPanel', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="ai-chat-panel" data-open={isOpen} />
  ),
}));

vi.mock('@/components/pdf-viewer/PDFSearch', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="pdf-search" data-open={isOpen} />
  ),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

const defaultManual = {
  id: 'm1',
  title: 'Secret Agent Manual',
  description: 'Top secret things',
  pageCount: 10,
  folderId: null,
  displayOrder: 1,
  createdAt: '2023-01-01T00:00:00Z',
  pdfUrl: 'https://example.com/manual.pdf',
};

describe('PortalManualViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    // Default to desktop
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it('renders header with manual title and company name', () => {
    render(
      <PortalManualViewer
        manual={defaultManual}
        onBack={vi.fn()}
        companyName="Acme Corp"
      />
    );

    expect(screen.getAllByText('Secret Agent Manual').length).toBeGreaterThan(0);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-controls')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
  });

  it('toggles Search and AI Chat panels visibility', () => {
    render(
      <PortalManualViewer
        manual={defaultManual}
        onBack={vi.fn()}
        companyName="Acme Corp"
      />
    );

    // Initial state: Chat closed (conditional rendering), Search closed (attribute-based)
    expect(screen.queryByTestId('ai-chat-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('pdf-search')).toHaveAttribute('data-open', 'false');

    // Toggle Chat
    fireEvent.click(screen.getByRole('button', { name: /AI Chat/i }));
    expect(screen.getByTestId('ai-chat-panel')).toBeInTheDocument();
    expect(screen.getByTestId('ai-chat-panel')).toHaveAttribute('data-open', 'true');

    // Toggle Search (via the mocked PDFControls)
    fireEvent.click(screen.getByRole('button', { name: /Toggle Search/i }));
    expect(screen.getByTestId('pdf-search')).toHaveAttribute('data-open', 'true');
  });

  it('applies custom primary and background colors to wrapper and text', () => {
    const { container } = render(
      <PortalManualViewer
        manual={defaultManual}
        onBack={vi.fn()}
        companyName="Acme Corp"
        primaryColor="#123456" // dark color = white text
        backgroundColor="#f0f0f0"
      />
    );

    // Check wrapper branding via CSS variables
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper?.style.getPropertyValue('--background')).toBeTruthy();
    expect(wrapper?.style.getPropertyValue('--primary')).toBeTruthy();
    expect(wrapper?.style.getPropertyValue('--primary-foreground')).toBeTruthy();

    const header = container.querySelector('header');
    expect(header).toHaveClass('bg-primary');
    expect(header).toHaveClass('text-primary-foreground');
  });

  it('tracks viewing duration via backend fetch on unmount', () => {
    const { unmount } = render(
      <PortalManualViewer
        manual={defaultManual}
        onBack={vi.fn()}
        companyName="Acme Corp"
      />
    );

    // Unmount the component to trigger the tracking
    unmount();

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/analytics/view'), expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"manual_id":"m1"')
    }));
  });

  it('tracks viewing duration when onBack is called', () => {
    const mockBack = vi.fn();
    render(
      <PortalManualViewer
        manual={defaultManual}
        onBack={mockBack}
        companyName="Acme Corp"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));

    expect(mockBack).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/analytics/view'), expect.any(Object));
  });

  it('renders correctly on a mobile viewport (toggles chat display correctly)', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);

    render(
      <PortalManualViewer
        manual={defaultManual}
        onBack={vi.fn()}
        companyName="Acme Corp"
      />
    );

    // Initial state: not in document
    expect(screen.queryByTestId('ai-chat-panel')).not.toBeInTheDocument();
    
    // Toggle Chat
    const chatButton = screen.getByRole('button', { name: /AI Chat/i });
    expect(chatButton).toBeInTheDocument();
    fireEvent.click(chatButton);
    expect(screen.getByTestId('ai-chat-panel')).toBeInTheDocument();
  });
});
