import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import PortalEdit from './PortalEdit';
import * as AuthContextModule from '@/contexts/AuthContext';
import * as PermissionsModule from '@/hooks/usePermissions';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual as any, useNavigate: () => mockNavigate };
});

// PortalSettings is a complex component — mock it to isolate PortalEdit routing logic
vi.mock('@/components/dashboard/PortalSettings', () => ({
  PortalSettings: () => <div data-testid="portal-settings">Portal Settings Content</div>,
}));

const defaultPermissions = {
  canEditPortal: true,
  canEditManuals: true,
  canManageUsers: true,
  canViewAnalytics: true,
  permissions: [],
  loading: false,
  hasPermission: vi.fn(),
  hasAnyPermission: vi.fn(),
  hasAllPermissions: vi.fn(),
};

describe('PortalEdit Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'admin@test.com' },
      companyId: 'company-1',
      loading: false,
      signOut: vi.fn(),
    } as any);

    vi.spyOn(PermissionsModule, 'usePermissions').mockReturnValue(defaultPermissions);
  });

  it('shows a spinner when auth is loading', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      companyId: null,
      loading: true,
      signOut: vi.fn(),
    } as any);

    const { container } = render(
      <BrowserRouter><PortalEdit /></BrowserRouter>
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows a spinner when user lacks canEditPortal (while still loading/redirecting)', () => {
    vi.spyOn(PermissionsModule, 'usePermissions').mockReturnValue({
      ...defaultPermissions,
      canEditPortal: false,
    });

    const { container } = render(
      <BrowserRouter><PortalEdit /></BrowserRouter>
    );
    // Component falls into the spinner guard when canEditPortal is false
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('navigates to /dashboard when user lacks canEditPortal', async () => {
    vi.spyOn(PermissionsModule, 'usePermissions').mockReturnValue({
      ...defaultPermissions,
      canEditPortal: false,
    });

    render(<BrowserRouter><PortalEdit /></BrowserRouter>);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('renders the Portal Settings header and PortalSettings component', async () => {
    render(<BrowserRouter><PortalEdit /></BrowserRouter>);

    await waitFor(() => {
      expect(screen.getByText('Portal Settings')).toBeInTheDocument();
      expect(screen.getByTestId('portal-settings')).toBeInTheDocument();
    });
  });
});
