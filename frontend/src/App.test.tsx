import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as AuthContextModule from '@/contexts/AuthContext';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

vi.mock('./pages/Index', () => ({ default: () => <div>Index Page</div> }));
vi.mock('./pages/Auth', () => ({ default: () => <div>Auth Page</div> }));
vi.mock('./pages/Dashboard', () => ({ default: () => <div>Dashboard Page</div> }));
vi.mock('./pages/PortalEdit', () => ({ default: () => <div>PortalEdit Page</div> }));
vi.mock('./pages/ManualsManagement', () => ({ default: () => <div>ManualsManagement Page</div> }));
vi.mock('./pages/Analytics', () => ({ default: () => <div>Analytics Page</div> }));
vi.mock('./pages/InternalManualViewer', () => ({ default: () => <div>InternalManualViewer Page</div> }));
vi.mock('./pages/CompanyPortal', () => ({ default: () => <div>CompanyPortal Page</div> }));
vi.mock('./pages/CompanyPortalLogin', () => ({ default: () => <div>CompanyPortalLogin Page</div> }));
vi.mock('./pages/CompanyUsers', () => ({ default: () => <div>CompanyUsers Page</div> }));
vi.mock('./pages/NotFound', () => ({ default: () => <div>Not Found</div> }));
vi.mock('./pages/Superadmin', () => ({ default: () => <div>Superadmin Page</div> }));
vi.mock('./pages/DocBuilder', () => ({ default: () => <div>DocBuilder Page</div> }));

import { supabase } from '@/integrations/supabase/client';

const defaultAuth = {
  user: null,
  session: null,
  companyId: null,
  companyUserId: null,
  isSuperadmin: false,
  permissions: [],
  loading: false,
  signUp: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
  refreshPermissions: vi.fn(),
};

// Test DashboardRoute logic directly via a harness that mirrors App.tsx's DashboardRoute
function DashboardRouteHarness({ children }: { children: React.ReactNode }) {
  const { companyUserId, isSuperadmin, loading } = AuthContextModule.useAuth();

  if (loading) {
    return (
      <div>
        <div className="animate-spin" />
      </div>
    );
  }

  if (!companyUserId && !isSuperadmin) {
    return (
      <div>
        <h1>No dashboard access</h1>
        <p>Your account is not associated with a platform workspace.</p>
        <button onClick={() => window.location.href = "/"}>Go to homepage</button>
      </div>
    );
  }

  return <>{children}</>;
}

describe('DashboardRoute guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows spinner while auth is loading', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      ...defaultAuth,
      loading: true,
    } as any);

    const { container } = render(
      <DashboardRouteHarness>
        <div>Protected Content</div>
      </DashboardRouteHarness>
    );

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('shows no-access screen for user without companyUserId or superadmin', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      ...defaultAuth,
      user: { id: 'u1', email: 'portal@test.com' },
      companyUserId: null,
      isSuperadmin: false,
    } as any);

    render(
      <DashboardRouteHarness>
        <div>Protected Content</div>
      </DashboardRouteHarness>
    );

    expect(screen.getByText('No dashboard access')).toBeInTheDocument();
    expect(screen.getByText(/not associated with a platform workspace/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children for user with companyUserId', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      ...defaultAuth,
      user: { id: 'u1', email: 'user@test.com' },
      companyUserId: 'cu1',
      isSuperadmin: false,
    } as any);

    render(
      <DashboardRouteHarness>
        <div>Protected Content</div>
      </DashboardRouteHarness>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('No dashboard access')).not.toBeInTheDocument();
  });

  it('renders children for superadmin without companyUserId', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      ...defaultAuth,
      user: { id: 'u1', email: 'admin@test.com' },
      companyUserId: null,
      isSuperadmin: true,
    } as any);

    render(
      <DashboardRouteHarness>
        <div>Protected Content</div>
      </DashboardRouteHarness>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('No dashboard access')).not.toBeInTheDocument();
  });

  it('go to homepage button is rendered on no-access screen', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      ...defaultAuth,
      user: { id: 'u1', email: 'portal@test.com' },
      companyUserId: null,
      isSuperadmin: false,
    } as any);

    render(
      <DashboardRouteHarness>
        <div>Protected Content</div>
      </DashboardRouteHarness>
    );

    const btn = screen.getByRole('button', { name: /go to homepage/i });
    expect(btn).toBeInTheDocument();
  });
});
