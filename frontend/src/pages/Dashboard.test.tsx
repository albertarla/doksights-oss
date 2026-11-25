import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import * as AuthContextModule from '@/contexts/AuthContext';
import * as PermissionsModule from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn()
}));

// Mock React Router
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    useNavigate: () => mockNavigate,
  };
});

// Mock the Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockResolvedValue({ data: [], error: null }) // default array return for queries
    }))
  }
}));

describe('Dashboard Page Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock useAuth
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      companyId: 'company-1',
      isSuperadmin: false,
      loading: false,
      signOut: vi.fn(),
    } as any);

    // Mock usePermissions
    vi.spyOn(PermissionsModule, 'usePermissions').mockReturnValue({
      canEditPortal: true,
      canEditManuals: true,
      canManageUsers: true,
      canViewAnalytics: true,
      permissions: [],
      loading: false,
      hasPermission: vi.fn(),
      hasAnyPermission: vi.fn(),
      hasAllPermissions: vi.fn(),
    });
  });

  it('renders loading state when auth is loading', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      loading: true,
      user: null
    } as any);

    const { container } = render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    // Expect the spinning loading div
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders the dashboard with all permission buttons visible', async () => {
    const mockSupabaseCall = vi.fn((table: string) => {
      const queryMethods = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      };

      if (table === 'companies') {
        return {
          ...queryMethods,
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'c1', name: 'Test Corp', portal_enabled: true },
            error: null
          })
        };
      } else if (table === 'manuals') {
        const prom = Promise.resolve({ data: [{ id: 'm1', title: 'Test Manual', is_public: false }], error: null });
        return { ...queryMethods, then: prom.then.bind(prom) };
      } else if (table === 'folders') {
        const prom = Promise.resolve({ data: [], error: null });
        return { ...queryMethods, then: prom.then.bind(prom) };
      }
      return queryMethods;
    });

    // Overwrite the mock for this test
    (supabase.from as any).mockImplementation(mockSupabaseCall);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    // Wait for the component to fetch data and render the main title
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Verify permission-gated buttons exist
    expect(screen.getByText('Portal Settings')).toBeInTheDocument();
    expect(screen.getByText('Manage Documents')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();

    // Verify company name rendered
    await waitFor(() => {
      expect(screen.getByText('Test Corp')).toBeInTheDocument();
    });
  });

  it('hides permission buttons when permissions are denied', async () => {
    vi.spyOn(PermissionsModule, 'usePermissions').mockReturnValue({
      canEditPortal: false,
      canEditManuals: false,
      canManageUsers: false,
      canViewAnalytics: false,
      permissions: [],
      loading: false,
      hasPermission: vi.fn(),
      hasAnyPermission: vi.fn(),
      hasAllPermissions: vi.fn(),
    });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    expect(screen.queryByText('Portal Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage Documents')).not.toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Superadmin')).not.toBeInTheDocument();
  });

  it('shows Superadmin button when user is a superadmin', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      companyId: 'company-1',
      isSuperadmin: true,
      loading: false,
      signOut: vi.fn(),
    } as any);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    expect(screen.getByText('Superadmin')).toBeInTheDocument();
  });
});
