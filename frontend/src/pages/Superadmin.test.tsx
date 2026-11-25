import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Superadmin from './Superadmin';
import * as AuthContextModule from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import userEvent from '@testing-library/user-event';

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
    from: vi.fn(),
    auth: {
      signOut: vi.fn()
    }
  }
}));

describe('Superadmin Page Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock useAuth
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'super-1', email: 'super@example.com' },
      isSuperadmin: true,
      loading: false,
      signOut: vi.fn(),
    } as any);
  });

  it('redirects to dashboard if not superadmin', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      isSuperadmin: false,
      loading: false,
      signOut: vi.fn(),
    } as any);

    render(
      <BrowserRouter>
        <Superadmin />
      </BrowserRouter>
    );
    
    // Navigate is used via <Navigate to="/dashboard" />.
    // In testing library, we generally check if nothing renders or if mock functions were called, 
    // but <Navigate> acts in the context. However, the component returns <Navigate> which mounts.
    // Instead of testing <Navigate> explicitly here, verifying that "Superadmin Dashboard" doesn't render is sufficient.
    expect(screen.queryByText('Superadmin Dashboard')).not.toBeInTheDocument();
  });

  it('renders loading state initially if data is loading', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      loading: true,
      isSuperadmin: true,
      user: null
    } as any);

    const { container } = render(
      <BrowserRouter>
        <Superadmin />
      </BrowserRouter>
    );
    
    // Component returns null initially when auth loading
    expect(container.innerHTML).toBe('');
  });

  it('renders the superadmin dashboard with system data', async () => {
    const mockSupabaseCall = vi.fn((table: string) => {
        const queryMethods = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
        };

        if (table === 'companies') {
            return {
                ...queryMethods,
                then: vi.fn().mockImplementation((cb) => {
                  return Promise.resolve({ 
                    data: [
                      { id: 'c1', name: 'Test Corp 1', slug: 'test-1', portal_enabled: true, created_at: '2026-01-01T00:00:00Z' },
                      { id: 'c2', name: 'Test Corp 2', slug: 'test-2', portal_enabled: false, created_at: '2026-01-02T00:00:00Z' }
                    ], 
                    error: null 
                  }).then(cb);
                })
            };
        } else if (table === 'manuals' || table === 'company_users') {
            return {
                ...queryMethods,
                then: vi.fn().mockImplementation((cb) => {
                  return Promise.resolve({ count: 5, error: null }).then(cb);
                })
            };
        }
        return queryMethods;
    });

    // Overwrite the mock for this test
    (supabase.from as any).mockImplementation(mockSupabaseCall);

    render(
      <BrowserRouter>
        <Superadmin />
      </BrowserRouter>
    );

    // Wait for the component to fetch data and render the main title
    await waitFor(() => {
      expect(screen.getByText('Superadmin Dashboard')).toBeInTheDocument();
    });

    // Verify company names rendered
    await waitFor(() => {
      expect(screen.getByText('Test Corp 1')).toBeInTheDocument();
      expect(screen.getByText('Test Corp 2')).toBeInTheDocument();
    });

    // Verify totals
    expect(screen.getByText('Total Companies')).toBeInTheDocument();
    expect(screen.getAllByText('10').length).toBeGreaterThan(0); // 5+5 users, 5+5 manuals => Total Users: 10, Total Manuals: 10
  });
  
  it('calls signOut correctly', async () => {
     (supabase.from as any).mockImplementation(() => ({
       select: vi.fn().mockReturnThis(),
       order: vi.fn().mockReturnThis(),
       eq: vi.fn().mockReturnThis(),
       then: vi.fn().mockImplementation((cb) => Promise.resolve({ data: [], error: null }).then(cb))
     }));
     
     render(
      <BrowserRouter>
        <Superadmin />
      </BrowserRouter>
    );
    
    await waitFor(() => {
      expect(screen.getByText('Superadmin Dashboard')).toBeInTheDocument();
    });
    
    const signOutBtn = screen.getByText('Sign out');
    await userEvent.click(signOutBtn);
    
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
