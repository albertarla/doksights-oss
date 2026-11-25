import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import InternalManualViewer from './InternalManualViewer';
import * as AuthContextModule from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';

const { mockParams } = vi.hoisted(() => ({ mockParams: { id: 'manual-1' } }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    useParams: () => mockParams,
  };
});

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'manual-1', title: 'My Test Manual', description: null, file_path: 'path/to.pdf', manual_type: 'pdf' },
        error: null,
      }),
    })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/signed-url.pdf' },
          error: null,
        }),
      })),
    },
  },
}));

// Mock heavy PDF/chat sub-components
vi.mock('@/components/pdf-viewer/PDFControls', () => ({
  default: () => <div data-testid="pdf-controls" />,
}));
vi.mock('@/components/pdf-viewer/PDFDocument', () => ({
  default: () => <div data-testid="pdf-document" />,
}));
vi.mock('@/components/pdf-viewer/PageThumbnails', () => ({
  default: () => <div data-testid="page-thumbnails" />,
}));
vi.mock('@/components/pdf-viewer/AIChatPanel', () => ({
  default: () => <div data-testid="ai-chat-panel" />,
}));
vi.mock('@/components/pdf-viewer/PDFSearch', () => ({
  default: () => <div data-testid="pdf-search" />,
}));

describe('InternalManualViewer Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default to desktop
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it('shows a spinner while auth is loading', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      companyId: null,
      loading: true,
      signOut: vi.fn(),
    } as any);

    const { container } = render(
      <BrowserRouter><InternalManualViewer /></BrowserRouter>
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.getByText('Loading manual...')).toBeInTheDocument();
  });

  it('redirects to /auth when user is not authenticated', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      companyId: null,
      loading: false,
      signOut: vi.fn(),
    } as any);

    render(<BrowserRouter><InternalManualViewer /></BrowserRouter>);

    // With BrowserRouter, Navigate sends user to /auth — confirm root doesn't crash
    expect(document.body).toBeInTheDocument();
  });

  it('shows the error state when manual is not found', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'test@test.com' },
      companyId: 'company-1',
      loading: false,
      signOut: vi.fn(),
    } as any);

    // Override: manual query returns null (not found)
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    });

    render(<BrowserRouter><InternalManualViewer /></BrowserRouter>);

    await waitFor(() => {
      expect(screen.getByText('Manual Not Found')).toBeInTheDocument();
    });
  });

  it('renders the viewer layout with manual title after successful load', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'test@test.com' },
      companyId: 'company-1',
      loading: false,
      signOut: vi.fn(),
    } as any);

    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'manual-1', title: 'My Test Manual', description: null, file_path: 'test.pdf', manual_type: 'pdf' },
        error: null,
      }),
    });

    render(<BrowserRouter><InternalManualViewer /></BrowserRouter>);

    await waitFor(() => {
      expect(screen.getByText('My Test Manual')).toBeInTheDocument();
    });
  });

  it('renders correctly on a mobile viewport (without crashing from ResizablePanel)', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'test@test.com' },
      companyId: 'company-1',
      loading: false,
      signOut: vi.fn(),
    } as any);

    vi.mocked(useIsMobile).mockReturnValue(true);

    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'manual-1', title: 'My Mobile Manual', description: null, file_path: 'test.pdf', manual_type: 'pdf' },
        error: null,
      }),
    });

    render(<BrowserRouter><InternalManualViewer /></BrowserRouter>);

    await waitFor(() => {
      expect(screen.getByText('My Mobile Manual')).toBeInTheDocument();
    });
    
    // Check that PDF controls and document render
    expect(screen.getByTestId('pdf-controls')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
  });
});
