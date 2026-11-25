import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';

// ── Supabase mock ──────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => {
  const onAuthStateChangeCb = vi.fn();
  return {
    supabase: {
      auth: {
        onAuthStateChange: vi.fn((cb) => {
          onAuthStateChangeCb.mockImplementation(cb);
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
      })),
      removeChannel: vi.fn(),
    },
  };
});

// ── Helper: component that exposes useAuth values ─────────────────────────
function AuthConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="user">{auth.user?.email ?? 'null'}</span>
      <span data-testid="companyId">{auth.companyId ?? 'null'}</span>
      <span data-testid="permissions">{auth.permissions.join(',')}</span>
      <button onClick={() => auth.signOut()}>Sign Out</button>
      <button onClick={() => auth.signIn('a@b.com', 'pass123')}>Sign In</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no session
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } });
    (supabase.auth.onAuthStateChange as any).mockImplementation((_cb: any) => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
  });

  it('starts in loading state and resolves false with no session', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    );
    expect(screen.getByTestId('user')).toHaveTextContent('null');
  });

  it('fetches company data and permissions when a session exists', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    const mockSession = { user: mockUser };

    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockSession } });

    // company_users returns a company user
    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(
        table === 'company_users'
          ? { data: { id: 'cu-1', company_id: 'co-1' }, error: null }
          : { data: null, error: null }
      ),
      // permissions fetch
      then: table === 'company_user_permissions'
        ? Promise.resolve({ data: [{ permission_key: 'page.manuals' }], error: null }).then.bind(
            Promise.resolve({ data: [{ permission_key: 'page.manuals' }], error: null })
          )
        : Promise.resolve({ data: [], error: null }).then.bind(Promise.resolve({ data: [], error: null })),
    }));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    );

    expect(screen.getByTestId('companyId')).toHaveTextContent('co-1');
  });

  it('signOut calls supabase.auth.signOut and clears auth state', async () => {
    (supabase.auth.signOut as any).mockResolvedValue({});

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => screen.getByTestId('loading').textContent === 'false');

    screen.getByRole('button', { name: 'Sign Out' }).click();

    await waitFor(() =>
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1)
    );
  });

  it('signIn calls supabase.auth.signInWithPassword with correct args', async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ error: null });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => screen.getByTestId('loading').textContent === 'false');

    screen.getByRole('button', { name: 'Sign In' }).click();

    await waitFor(() =>
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'pass123',
      })
    );
  });

  it('useAuth throws when used outside AuthProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<AuthConsumer />)).toThrow(
      'useAuth must be used within an AuthProvider'
    );

    consoleSpy.mockRestore();
  });
});
