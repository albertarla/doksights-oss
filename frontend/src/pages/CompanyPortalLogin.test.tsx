import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CompanyPortalLogin from './CompanyPortalLogin';
import * as AuthContextModule from '@/contexts/AuthContext';

const { mockNavigate, supabaseMock } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  supabaseMock: {
    from: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as any), useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as any), getThemeVariables: () => ({}) };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: supabaseMock,
}));

const mockBranding = {
  id: 'c1',
  name: 'Acme Corp',
  logo_url: null,
  portal_primary_color: '#3b82f6',
  portal_background_color: '#ffffff',
};

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

const renderLogin = (slug = 'acme') =>
  render(
    <MemoryRouter initialEntries={[`/company/${slug}/login`]}>
      <Routes>
        <Route path="/company/:companySlug/login" element={<CompanyPortalLogin />} />
      </Routes>
    </MemoryRouter>
  );

describe('CompanyPortalLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(defaultAuth as any);

    // Default: branding fetch succeeds, access checks return no rows
    supabaseMock.from.mockImplementation((table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        single: () => Promise.resolve({ data: table === 'companies' ? mockBranding : null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    });
  });

  it('renders the login form after branding loads', async () => {
    renderLogin();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText(/acme corp/i)).toBeInTheDocument();
  });

  it('shows Forgot password link', async () => {
    renderLogin();

    await waitFor(() => {
      expect(screen.getByText('Forgot password?')).toBeInTheDocument();
    });
  });

  it('calls signInWithPassword on form submit', async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    });
    // After sign-in, access check returns a portal_users row
    supabaseMock.from.mockImplementation((table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        single: () => Promise.resolve({ data: mockBranding, error: null }),
        maybeSingle: () => Promise.resolve({
          data: table === 'portal_users' ? { id: 'pu1' } : null,
          error: null,
        }),
      };
      return chain;
    });

    renderLogin();

    await waitFor(() => screen.getByLabelText('Email'));

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: 'secret123',
      });
    });
  });

  it('shows error and signs out when user has no portal access', async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    });

    renderLogin();

    await waitFor(() => screen.getByLabelText('Email'));

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'noaccess@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(supabaseMock.auth.signOut).toHaveBeenCalled();
      expect(screen.getByText(/do not have access/i)).toBeInTheDocument();
    });
  });

  it('redirects authenticated portal user immediately without showing form', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      ...defaultAuth,
      user: { id: 'u1', email: 'user@test.com' } as any,
    } as any);

    supabaseMock.from.mockImplementation((table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        single: () => Promise.resolve({ data: mockBranding, error: null }),
        maybeSingle: () => Promise.resolve({
          data: table === 'portal_users' ? { id: 'pu1' } : null,
          error: null,
        }),
      };
      return chain;
    });

    renderLogin('acme');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/company/acme', { replace: true });
    });
  });

  it('shows error when company portal does not exist', async () => {
    supabaseMock.from.mockImplementation(() => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: () => Promise.resolve({ data: null, error: { message: 'Not found' } }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    });

    renderLogin('nonexistent');

    await waitFor(() => {
      expect(screen.getByText(/does not exist/i)).toBeInTheDocument();
    });
  });
});
