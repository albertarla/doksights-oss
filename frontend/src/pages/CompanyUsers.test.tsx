import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import CompanyUsers from './CompanyUsers';
import * as AuthContextModule from '@/contexts/AuthContext';
import * as PermissionsModule from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';

import { toast } from 'sonner';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual as any, useNavigate: () => mockNavigate };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

// Default: all tables return empty arrays
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const emptyProm = Promise.resolve({ data: [], error: null });
      const singleProm = Promise.resolve({ data: { name: 'Acme Corp' }, error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(table === 'companies' ? { data: { name: 'Acme Corp' }, error: null } : { data: null, error: null }),
        single: vi.fn().mockResolvedValue(singleProm),
        then: emptyProm.then.bind(emptyProm),
      };
    }),
    rpc: vi.fn(),
  },
}));

const defaultPermissions = {
  canManageUsers: true,
  canEditPortal: true,
  canEditManuals: true,
  canViewAnalytics: true,
  permissions: [],
  loading: false,
  hasPermission: vi.fn(),
  hasAnyPermission: vi.fn(),
  hasAllPermissions: vi.fn(),
};

describe('CompanyUsers Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: () => 'test-uuid'
      }
    });

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
      <BrowserRouter><CompanyUsers /></BrowserRouter>
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('redirects to /dashboard when user lacks canManageUsers', async () => {
    vi.spyOn(PermissionsModule, 'usePermissions').mockReturnValue({
      ...defaultPermissions,
      canManageUsers: false,
    });

    render(<BrowserRouter><CompanyUsers /></BrowserRouter>);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('renders the User Management heading', async () => {
    render(<BrowserRouter><CompanyUsers /></BrowserRouter>);

    await waitFor(() => {
      // "User Management" appears in both the page header span and the Members card title
      const elements = screen.getAllByText('User Management');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows "No invites yet." when invite list is empty', async () => {
    render(<BrowserRouter><CompanyUsers /></BrowserRouter>);

    await waitFor(() => {
      expect(screen.getByText('No invites yet.')).toBeInTheDocument();
    });
  });

  it('shows "No members found." when member list is empty', async () => {
    render(<BrowserRouter><CompanyUsers /></BrowserRouter>);

    await waitFor(() => {
      expect(screen.getByText('No members found.')).toBeInTheDocument();
    });
  });

  it('renders a populated list of members and invites', async () => {
    const mockSupabaseCall = vi.fn((table: string) => {
      const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis() };
      
      if (table === 'company_users') return { ...q, then: Promise.resolve({ data: [{ id: 'm1', user_id: 'u1', status: 'active', role: 'admin' }], error: null }).then.bind(Promise.resolve({ data: [{ id: 'm1', user_id: 'u1', status: 'active', role: 'admin' }], error: null })) };
      if (table === 'profiles') return { ...q, then: Promise.resolve({ data: [{ id: 'u1', email: 'user@test.com' }], error: null }).then.bind(Promise.resolve({ data: [{ id: 'u1', email: 'user@test.com' }], error: null })) };
      if (table === 'company_user_permissions') return { ...q, then: Promise.resolve({ data: [{ company_user_id: 'm1', permission_key: 'page.manuals' }], error: null }).then.bind(Promise.resolve({ data: [{ company_user_id: 'm1', permission_key: 'page.manuals' }], error: null })) };
      
      if (table === 'company_invites') return { ...q, then: Promise.resolve({ data: [{ id: 'i1', email: 'invite@test.com', token: 'tok1' }], error: null }).then.bind(Promise.resolve({ data: [{ id: 'i1', email: 'invite@test.com', token: 'tok1' }], error: null })) };
      if (table === 'company_invite_permissions') return { ...q, then: Promise.resolve({ data: [{ invite_id: 'i1', permission_key: 'page.users' }], error: null }).then.bind(Promise.resolve({ data: [{ invite_id: 'i1', permission_key: 'page.users' }], error: null })) };
      
      if (table === 'companies') return { ...q, maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Acme Corp' } }) };
      
      return { ...q, then: Promise.resolve({ data: [], error: null }).then.bind(Promise.resolve({ data: [], error: null })) };
    });
    
    (supabase.from as any).mockImplementation(mockSupabaseCall);

    render(<BrowserRouter><CompanyUsers /></BrowserRouter>);

    await waitFor(() => {
      expect(screen.getByText('user@test.com')).toBeInTheDocument();
      expect(screen.getByText('invite@test.com')).toBeInTheDocument();
    });
  });

  it('creates an invite successfully', async () => {
    const insertMock = vi.fn().mockReturnThis();
    (supabase.from as any).mockImplementation((table: string) => {
      const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), insert: insertMock };
      if (table === 'company_invites') {
        insertMock.mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'new-invite-id' }, error: null })
          })
        });
      } else if (table === 'company_invite_permissions') {
        insertMock.mockResolvedValue({ error: null });
      } else if (table === 'companies') {
        return { ...q, maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Acme Corp' } }) };
      }
      return { ...q, then: Promise.resolve({ data: [], error: null }).then.bind(Promise.resolve({ data: [], error: null })) };
    });

    render(<BrowserRouter><CompanyUsers /></BrowserRouter>);
    
    // Wait for initial render and data fetch to complete
    await waitFor(() => expect(screen.getAllByText('User Management').length).toBeGreaterThan(0));

    // Fill form
    const emailInput = screen.getByPlaceholderText('name@company.com');
    fireEvent.change(emailInput, { target: { value: 'new@friend.com' } });
    
    screen.getByText('Create Invite').click();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Invite created.');
    });
  });

  it('revokes an invite', async () => {
    const deleteMock = vi.fn().mockReturnThis();
    (supabase.from as any).mockImplementation((table: string) => {
      const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Acme Corp' } }) };
      if (table === 'company_invites') {
        const prom = Promise.resolve({ data: [{ id: 'i1', email: 'invite@test.com', token: 'tok1' }], error: null });
        return { ...q, delete: deleteMock, then: prom.then.bind(prom) };
      }
      return { ...q, then: Promise.resolve({ data: [], error: null }).then.bind(Promise.resolve({ data: [], error: null })) };
    });
    deleteMock.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    render(<BrowserRouter><CompanyUsers /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('invite@test.com')).toBeInTheDocument());

    screen.getByText('Revoke').click();

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Invite revoked.');
    });
  });

  it('removes member', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Acme Corp' } }) };
      if (table === 'company_users') {
        const prom = Promise.resolve({ data: [{ id: 'm1', user_id: 'u2', status: 'active', role: 'member' }], error: null });
        return { ...q, then: prom.then.bind(prom) };
      }
      if (table === 'profiles') {
        const prom = Promise.resolve({ data: [{ id: 'u2', email: 'other@test.com' }], error: null });
        return { ...q, then: prom.then.bind(prom) };
      }
      return { ...q, then: Promise.resolve({ data: [], error: null }).then.bind(Promise.resolve({ data: [], error: null })) };
    });
    
    (supabase.rpc as any).mockResolvedValue({ error: null });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<BrowserRouter><CompanyUsers /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('other@test.com')).toBeInTheDocument());

    screen.getByText('Remove').click();

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('delete_user', { target_user_id: 'u2' });
      expect(toast.success).toHaveBeenCalledWith('User removed.');
    });
  });

  it('edits member permissions', async () => {
    const deleteMock = vi.fn().mockReturnThis();
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    
    (supabase.from as any).mockImplementation((table: string) => {
      const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Acme Corp' } }) };
      if (table === 'company_users') {
        const prom = Promise.resolve({ data: [{ id: 'm1', user_id: 'u2', status: 'active', role: 'member' }], error: null });
        return { ...q, then: prom.then.bind(prom) };
      }
      if (table === 'profiles') {
        const prom = Promise.resolve({ data: [{ id: 'u2', email: 'other@test.com' }], error: null });
        return { ...q, then: prom.then.bind(prom) };
      }
      if (table === 'company_user_permissions') {
        const prom = Promise.resolve({ data: [{ company_user_id: 'm1', permission_key: 'page.manuals' }], error: null });
        return { ...q, delete: deleteMock, insert: insertMock, then: prom.then.bind(prom) };
      }
      return { ...q, then: Promise.resolve({ data: [], error: null }).then.bind(Promise.resolve({ data: [], error: null })) };
    });
    
    deleteMock.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }), in: vi.fn().mockResolvedValue({ error: null }) });

    render(<BrowserRouter><CompanyUsers /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('other@test.com')).toBeInTheDocument());

    screen.getByText('Edit Permissions').click();
    
    // Dialog opens, click the "Analytics" checkbox to add it
    await waitFor(() => expect(screen.getByText('Assign one or more permissions to this user. Permissions are enforced in the database.')).toBeInTheDocument());
    
    const analyticsCheckboxes = screen.getAllByText('Analytics');
    const analyticsCheckbox = analyticsCheckboxes[analyticsCheckboxes.length - 1].closest('label')?.querySelector('button') as HTMLButtonElement;
    fireEvent.click(analyticsCheckbox);
    
    screen.getByText('Save Permissions').click();

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Permissions updated.');
    });
  });
});
