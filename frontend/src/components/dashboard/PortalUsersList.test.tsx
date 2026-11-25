import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PortalUsersList } from './PortalUsersList';
import * as AuthContextModule from '@/contexts/AuthContext';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/config/chatApi', () => ({
  CHAT_API_CONFIG: { BASE_URL: 'http://localhost:8000/api/v1' },
}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: supabaseMock,
}));

const defaultAuth = {
  session: { access_token: 'mock-token' },
  user: { id: 'u1' },
  companyId: 'c1',
  companyUserId: 'cu1',
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

const mockPortalUsers = [
  { id: 'pu1', email: 'alice@example.com', created_at: '2026-01-01T00:00:00Z' },
  { id: 'pu2', email: 'bob@example.com', created_at: '2026-01-02T00:00:00Z' },
];

const mockPendingInvites = [
  { id: 'pi1', email: 'charlie@example.com', expires_at: '2099-01-01T00:00:00Z', created_at: '2026-01-03T00:00:00Z' },
];

const mockCompany = { name: 'Acme Corp', slug: 'acme' };

function setupDefaultMock() {
  supabaseMock.from.mockImplementation((table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      insert: () => chain,
      upsert: () => chain,
      delete: () => chain,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: mockCompany, error: null }),
    };

    if (table === 'portal_users') {
      chain.order = () => Promise.resolve({ data: mockPortalUsers, error: null });
    } else if (table === 'portal_invites') {
      chain.order = () => Promise.resolve({ data: mockPendingInvites, error: null });
    } else if (table === 'companies') {
      chain.single = () => Promise.resolve({ data: mockCompany, error: null });
    } else if (table === 'profiles') {
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    }

    return chain;
  });
}

describe('PortalUsersList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(defaultAuth as any);
    setupDefaultMock();
  });

  it('renders the invite form and section headers', async () => {
    render(<PortalUsersList companyId="c1" />);

    expect(screen.getByLabelText('Invite by Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /invite/i })).toBeInTheDocument();
    expect(screen.getByText('Authorized Users')).toBeInTheDocument();
    expect(screen.getByText('Pending Invitations')).toBeInTheDocument();
  });

  it('renders the list of authorized users after loading', async () => {
    render(<PortalUsersList companyId="c1" />);

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    });
  });

  it('renders pending invites after loading', async () => {
    render(<PortalUsersList companyId="c1" />);

    await waitFor(() => {
      expect(screen.getByText('charlie@example.com')).toBeInTheDocument();
    });
  });

  it('shows empty states when no users or invites exist', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({ data: mockCompany, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    });

    render(<PortalUsersList companyId="c1" />);

    await waitFor(() => {
      expect(screen.getByText('No authorized users yet.')).toBeInTheDocument();
      expect(screen.getByText('No pending invitations.')).toBeInTheDocument();
    });
  });

  it('disables invite button when email input is empty', async () => {
    render(<PortalUsersList companyId="c1" />);

    await waitFor(() => screen.getByLabelText('Invite by Email'));

    // The top-level send-invite button has exact accessible name "Invite"
    const inviteBtn = screen.getByRole('button', { name: /^invite$/i });
    expect(inviteBtn).toBeDisabled();
  });

  it('sends an invite email when user does not exist in profiles', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    let upsertCalled = false;
    supabaseMock.from.mockImplementation((table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({ data: { token: 'invite-token-abc' }, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        insert: () => chain,
        upsert: () => {
          upsertCalled = true;
          return chain;
        },
        delete: () => chain,
      };

      if (table === 'companies') {
        chain.single = () => Promise.resolve({ data: mockCompany, error: null });
      } else if (table === 'portal_invites') {
        chain.order = () => Promise.resolve({ data: [], error: null });
        chain.single = () => Promise.resolve({ data: { token: 'invite-token-abc' }, error: null });
      } else if (table === 'profiles') {
        chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      }

      return chain;
    });

    render(<PortalUsersList companyId="c1" />);

    await waitFor(() => screen.getByLabelText('Invite by Email'));

    fireEvent.change(screen.getByLabelText('Invite by Email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /invite/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/portal/send-invite'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    vi.unstubAllGlobals();
  });

  it('directly adds user when profile already exists', async () => {
    let insertCalled = false;
    supabaseMock.from.mockImplementation((table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({ data: mockCompany, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        insert: () => {
          insertCalled = true;
          return Promise.resolve({ error: null });
        },
        delete: () => chain,
      };

      if (table === 'profiles') {
        chain.maybeSingle = () => Promise.resolve({ data: { id: 'existing-user-id' }, error: null });
      } else if (table === 'companies') {
        chain.single = () => Promise.resolve({ data: mockCompany, error: null });
      }

      return chain;
    });

    render(<PortalUsersList companyId="c1" />);

    await waitFor(() => screen.getByLabelText('Invite by Email'));

    fireEvent.change(screen.getByLabelText('Invite by Email'), {
      target: { value: 'existing@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /invite/i }));

    await waitFor(() => {
      expect(insertCalled).toBe(true);
    });
  });

  it('calls delete on portal_users when remove button is clicked', async () => {
    let deleteEqValue: string | null = null;
    supabaseMock.from.mockImplementation((table: string) => {
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: string) => {
          if (table === 'portal_users' && col === 'id') deleteEqValue = val;
          return chain;
        },
        is: () => chain,
        order: () => Promise.resolve({ data: table === 'portal_users' ? mockPortalUsers : [], error: null }),
        single: () => Promise.resolve({ data: mockCompany, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        delete: () => chain,
        then: (fn: any) => Promise.resolve({ error: null }).then(fn),
      };

      if (table === 'portal_users') {
        chain.delete = () => ({ eq: (col: string, val: string) => {
          deleteEqValue = val;
          return Promise.resolve({ error: null });
        }});
      }

      return chain;
    });

    render(<PortalUsersList companyId="c1" />);

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByTitle('Remove user');
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(deleteEqValue).toBe('pu1');
    });
  });

  it('shows expired badge on expired invites', async () => {
    const expiredInvites = [
      { id: 'pi2', email: 'expired@example.com', expires_at: '2020-01-01T00:00:00Z', created_at: '2019-12-01T00:00:00Z' },
    ];

    supabaseMock.from.mockImplementation((table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => Promise.resolve({
          data: table === 'portal_invites' ? expiredInvites : [],
          error: null,
        }),
        single: () => Promise.resolve({ data: mockCompany, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    });

    render(<PortalUsersList companyId="c1" />);

    await waitFor(() => {
      expect(screen.getByText('expired@example.com')).toBeInTheDocument();
      expect(screen.getByText('Expired')).toBeInTheDocument();
    });
  });
});
