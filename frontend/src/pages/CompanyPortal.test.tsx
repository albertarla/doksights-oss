import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import CompanyPortal from './CompanyPortal';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import * as AuthContextModule from '@/contexts/AuthContext';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    }
  }
}));

vi.mock('@/components/portal/PortalManualViewer', () => ({
  PortalManualViewer: () => <div data-testid="portal-manual-viewer">Viewer</div>
}));
vi.mock('@/components/dashboard/DiscoveryChat', () => ({
  default: () => <div data-testid="discovery-chat">Chat</div>
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

// Mock React Router
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    useParams: () => ({ companySlug: 'test-company' }),
    useNavigate: () => mockNavigate,
  };
});

const defaultAuth = {
  user: null,
  signOut: vi.fn(),
  companyUserId: null,
  isSuperadmin: false,
};

describe('CompanyPortal Page Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockReset();
    // Default to desktop
    vi.mocked(useIsMobile).mockReturnValue(false);
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(defaultAuth as any);
  });

  it('renders loading skeletons initially', () => {
    // Hang the promise to keep it in loading state
    (supabase.functions.invoke as any).mockImplementation(() => new Promise(() => {}));
    
    const { container } = render(
      <BrowserRouter>
        <CompanyPortal />
      </BrowserRouter>
    );

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders error state when edge function fails', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: new Error('Network failure')
    });

    render(
      <BrowserRouter>
        <CompanyPortal />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Portal Not Available')).toBeInTheDocument();
      expect(screen.getByText('Unable to load company portal')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
    });
  });

  it('shows Sign Out button in error state when user is logged in', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      ...defaultAuth,
      user: { id: 'u1', email: 'test@test.com' } as any,
    } as any);

    (supabase.functions.invoke as any).mockResolvedValue({
      data: { error: 'PORTAL_ACCESS_DENIED' },
      error: null,
    });

    render(
      <BrowserRouter>
        <CompanyPortal />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign out \/ Switch Account/i })).toBeInTheDocument();
    });
  });

  it('renders successfully with data', async () => {
    const mockData = {
      company: {
        name: 'Acme Corp',
        description: 'Testing docs',
        logoUrl: null,
        primaryColor: '#ff0000',
        backgroundColor: '#ffffff',
      },
      folders: [
        {
          id: 'f1',
          name: 'Hardware',
          description: null,
          displayOrder: 0,
          manuals: [
            { id: 'm1', title: 'Printer Guide', description: null, pageCount: 10, folderId: 'f1', displayOrder: 0, createdAt: new Date().toISOString(), pdfUrl: '' }
          ]
        }
      ],
      uncategorizedManuals: [],
      totalManuals: 1
    };

    (supabase.functions.invoke as any).mockResolvedValue({
      data: mockData,
      error: null
    });

    render(
      <BrowserRouter>
        <CompanyPortal />
      </BrowserRouter>
    );

    // Header logic should display the company name
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      // It should display the folder name
      expect(screen.getByText('Hardware')).toBeInTheDocument();
      // It should display the manual name
      expect(screen.getByText('Printer Guide')).toBeInTheDocument();
    });
  });

  it('renders successfully on a mobile viewport (without crashing from ResizablePanel)', async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);

    const mockData = {
      company: {
        name: 'Acme Mobile',
        description: 'Testing docs',
        logoUrl: null,
        primaryColor: '#00ff00',
        backgroundColor: '#000000',
      },
      folders: [],
      uncategorizedManuals: [],
      totalManuals: 1
    };

    (supabase.functions.invoke as any).mockResolvedValue({
      data: mockData,
      error: null
    });

    render(
      <BrowserRouter>
        <CompanyPortal />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Acme Mobile')).toBeInTheDocument();
    });
    
    // Check that chat logic at least doesn't crash
    const chatButton = screen.getByRole('button', { name: /Find a Document/i });
    expect(chatButton).toBeInTheDocument();
  });

  it('redirects to the portal login page on PRIVATE_PORTAL error', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { error: 'PRIVATE_PORTAL', slug: 'test-company' },
      error: null,
    });

    render(
      <BrowserRouter>
        <CompanyPortal />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining('/company/test-company/login')
      );
    });
  });

  it('shows access-denied message on PORTAL_ACCESS_DENIED error', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { error: 'PORTAL_ACCESS_DENIED' },
      error: null,
    });

    render(
      <BrowserRouter>
        <CompanyPortal />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Portal Not Available')).toBeInTheDocument();
      expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
