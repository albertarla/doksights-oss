import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Auth from './Auth';
import * as AuthContextModule from '@/contexts/AuthContext';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual as any, useNavigate: () => mockNavigate };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn().mockImplementation(async (fnName, args) => {
      if (fnName === 'get_invite_context' && args.invite_token === 'valid123') {
        return { 
          data: [{
            invite_id: 'i1', company_id: 'c1', company_name: 'Acme Inc.',
            email: 'new@acme.com', permissions: ['page.manuals'], accepted_at: null
          }], 
          error: null 
        };
      }
      return { data: null, error: { message: 'not found' } };
    }),
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

// Mock toast so we don't need its provider
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const defaultAuth = {
  user: null,
  session: null,
  companyId: null,
  companyUserId: null,
  isSuperadmin: false,
  permissions: [],
  loading: false,
  signUp: vi.fn().mockResolvedValue({ error: null }),
  signIn: vi.fn().mockResolvedValue({ error: null }),
  resetPassword: vi.fn().mockResolvedValue({ error: null }),
  updatePassword: vi.fn().mockResolvedValue({ error: null }),
  signOut: vi.fn(),
  refreshPermissions: vi.fn(),
};

const renderAuth = (searchParams = '') =>
  render(
    <MemoryRouter initialEntries={[`/auth${searchParams}`]}>
      <Auth />
    </MemoryRouter>
  );

describe('Auth Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(defaultAuth as any);
  });

  it('renders sign-in form by default', () => {
    renderAuth();

    expect(screen.getByLabelText('Work Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('renders sign-up form and pre-fills email when valid invite is present', async () => {
    renderAuth('?invite=valid123');

    // Wait for the RPC to resolve
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    });

    // Check pre-filled details
    expect(screen.getByText('Invitation to Acme Inc.')).toBeInTheDocument();
    expect(screen.getByLabelText('Work Email')).toHaveValue('new@acme.com');
    // Ensure email is disabled for valid invites
    expect(screen.getByLabelText('Work Email')).toBeDisabled();
  });

  it('shows Zod validation error for invalid email', async () => {
    renderAuth();

    fireEvent.change(screen.getByLabelText('Work Email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.submit(screen.getByLabelText('Work Email').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });

    expect(defaultAuth.signIn).not.toHaveBeenCalled();
  });

  it('shows Zod validation error for empty password', async () => {
    renderAuth();

    fireEvent.change(screen.getByLabelText('Work Email'), { target: { value: 'test@test.com' } });
    // leave password empty
    fireEvent.submit(screen.getByLabelText('Work Email').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });

    expect(defaultAuth.signIn).not.toHaveBeenCalled();
  });

  it('calls signIn with correct credentials on submit', async () => {
    renderAuth();

    fireEvent.change(screen.getByLabelText('Work Email'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword' } });
    fireEvent.submit(screen.getByLabelText('Work Email').closest('form')!);

    await waitFor(() => {
      expect(defaultAuth.signIn).toHaveBeenCalledWith('user@test.com', 'mypassword');
    });
  });

  it('calls signUp with email, password, and invite token on submit', async () => {
    renderAuth('?invite=valid123');

    // Wait for form to become ready
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secretpass' } });
    fireEvent.submit(screen.getByLabelText('Work Email').closest('form')!);

    await waitFor(() => {
      // signUp(email, password, companyName, companyInviteToken, portalInviteToken)
      expect(defaultAuth.signUp).toHaveBeenCalledWith('new@acme.com', 'secretpass', undefined, 'valid123', undefined);
    });
  });

  it('shows Forgot Password form when clicking the link', async () => {
    renderAuth();
    
    const forgotLink = screen.getByRole('button', { name: /forgot password/i });
    fireEvent.click(forgotLink);
    
    expect(screen.getByText('Reset your password')).toBeInTheDocument();
    expect(screen.getByLabelText('Work Email')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
  });

  it('calls resetPassword on Forgot Password submit', async () => {
    renderAuth('?mode=forgot');
    
    fireEvent.change(screen.getByLabelText('Work Email'), { target: { value: 'user@test.com' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Send reset link' }));
    
    await waitFor(() => {
      expect(defaultAuth.resetPassword).toHaveBeenCalledWith('user@test.com');
    });
  });

  it('renders Reset Password form when landing on ?mode=reset', () => {
    renderAuth('?mode=reset');
    
    expect(screen.getByText('Set new password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update password' })).toBeInTheDocument();
  });

  it('calls updatePassword on Reset Password submit', async () => {
    renderAuth('?mode=reset');
    
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'newpassword123' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Update password' }));
    
    await waitFor(() => {
      expect(defaultAuth.updatePassword).toHaveBeenCalledWith('newpassword123');
    });
  });

  it('redirects to /dashboard when user is authenticated with a platform workspace', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      ...defaultAuth,
      user: { id: 'u1', email: 'existing@test.com' },
      companyUserId: 'cu1',
      isSuperadmin: false,
    } as any);

    renderAuth();

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('does NOT redirect portal-only users to /dashboard', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      ...defaultAuth,
      user: { id: 'u1', email: 'portal@test.com' },
      companyUserId: null,
      isSuperadmin: false,
    } as any);

    renderAuth();

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does NOT redirect to /dashboard when mode is reset even if user is authenticated', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      ...defaultAuth,
      user: { id: 'u1', email: 'existing@test.com' },
    } as any);

    renderAuth('?mode=reset');

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByText('Set new password')).toBeInTheDocument();
  });

  it('shows a spinner when auth is loading', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      ...defaultAuth,
      loading: true,
    } as any);

    const { container } = renderAuth();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});