import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import ManualsManagement from './ManualsManagement';
import * as AuthContextModule from '@/contexts/AuthContext';
import * as PermissionsModule from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual as any, useNavigate: () => mockNavigate };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

// Heavy sub-components that import PDF/Supabase internals are mocked at module level
vi.mock('@/components/manuals/UploadManualDialog', () => ({
  UploadManualDialog: () => null,
}));
vi.mock('@/components/manuals/EditManualDialog', () => ({
  EditManualDialog: () => null,
}));
vi.mock('@/components/manuals/DeleteManualDialog', () => ({
  DeleteManualDialog: () => null,
}));
vi.mock('@/components/manuals/CreateWebManualDialog', () => ({
  CreateWebManualDialog: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid={isOpen ? 'create-web-manual-dialog-open' : 'create-web-manual-dialog-closed'} />
  ),
}));
vi.mock('@/components/manuals/ManualCard', () => ({
  ManualCard: ({ manual, onEdit, onDelete, onTogglePublic, onFolderChange, onRetryProcess }: any) => (
    <div data-testid="manual-card">
      <span data-testid="manual-title">{manual.title}</span>
      <span data-testid={`status-${manual.id}`}>{manual.rag_status}</span>
      <button data-testid={`edit-${manual.id}`} onClick={onEdit}>Edit</button>
      <button data-testid={`delete-${manual.id}`} onClick={onDelete}>Delete</button>
      <button data-testid={`toggle-${manual.id}`} onClick={() => onTogglePublic(manual.id, !manual.is_public)}>Toggle</button>
      <button data-testid={`folder-${manual.id}`} onClick={() => onFolderChange(manual.id, 'folder-2')}>Folder</button>
      <button data-testid={`retry-${manual.id}`} onClick={() => onRetryProcess(manual.id)}>Retry</button>
    </div>
  ),
}));
vi.mock('@/components/folders/FolderManagement', () => ({
  FolderManagement: () => <div data-testid="folder-management" />,
}));
vi.mock('@/services/manualService', () => ({
  manualService: {
    processManual: vi.fn(),
  },
}));

const defaultPermissions = {
  canEditManuals: true,
  canEditPortal: true,
  canManageUsers: true,
  canViewAnalytics: true,
  permissions: [],
  loading: false,
  hasPermission: vi.fn(),
  hasAnyPermission: vi.fn(),
  hasAllPermissions: vi.fn(),
};

describe('ManualsManagement Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
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
      <BrowserRouter><ManualsManagement /></BrowserRouter>
    );

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('redirects to /dashboard when user lacks canEditManuals', async () => {
    vi.spyOn(PermissionsModule, 'usePermissions').mockReturnValue({
      ...defaultPermissions,
      canEditManuals: false,
    });

    render(<BrowserRouter><ManualsManagement /></BrowserRouter>);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('renders the empty state when no manuals exist', async () => {
    (supabase.from as any).mockImplementation(() => {
      const prom = Promise.resolve({ data: [], error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: prom.then.bind(prom),
      };
    });

    render(<BrowserRouter><ManualsManagement /></BrowserRouter>);

    await waitFor(() => {
      expect(screen.getByText('Upload your first manual')).toBeInTheDocument();
    });
  });

  it('renders manual cards when manuals are returned', async () => {
    const mockManuals = [{ id: 'm1', title: 'Product Guide', is_public: true }];

    (supabase.from as any).mockImplementation((table: string) => {
      const prom = table === 'manuals'
        ? Promise.resolve({ data: mockManuals, error: null })
        : Promise.resolve({ data: [], error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: prom.then.bind(prom),
      };
    });

    render(<BrowserRouter><ManualsManagement /></BrowserRouter>);

    await waitFor(() => {
      expect(screen.getByTestId('manual-card')).toBeInTheDocument();
      expect(screen.getByTestId('manual-title')).toHaveTextContent('Product Guide');
    });
  });

  it('triggers Edit dialog on manual edit action', async () => {
    const mockManuals = [{ id: 'm1', title: 'Product Guide', is_public: true }];
    (supabase.from as any).mockImplementation((table: string) => {
      const prom = Promise.resolve({ data: table === 'manuals' ? mockManuals : [], error: null });
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), then: prom.then.bind(prom) };
    });

    render(<BrowserRouter><ManualsManagement /></BrowserRouter>);
    await waitFor(() => expect(screen.getByTestId('edit-m1')).toBeInTheDocument(), { timeout: 3000 });

    screen.getByTestId('edit-m1').click();
    // In our tests, opening the dialog just sets state for the mocked component. 
    // We can at least confirm it doesn't crash here.
  });

  it('triggers Delete dialog on manual delete action', async () => {
    const mockManuals = [{ id: 'm1', title: 'Product Guide', is_public: true }];
    (supabase.from as any).mockImplementation((table: string) => {
      const prom = Promise.resolve({ data: table === 'manuals' ? mockManuals : [], error: null });
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), then: prom.then.bind(prom) };
    });

    render(<BrowserRouter><ManualsManagement /></BrowserRouter>);
    await waitFor(() => expect(screen.getByTestId('delete-m1')).toBeInTheDocument());

    screen.getByTestId('delete-m1').click();
  });

  it('toggles a manuals public visibility', async () => {
    const mockManuals = [{ id: 'm1', title: 'Product Guide', is_public: true }];
    const updateMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'manuals') {
        const prom = Promise.resolve({ data: mockManuals, error: null });
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), update: updateMock, then: prom.then.bind(prom) };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), then: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    // We have to specifically mock the update chain for toggle since it's triggered by the click
    (supabase.from as any).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), then: Promise.resolve({ data: mockManuals }).then.bind(Promise.resolve({ data: mockManuals }))
    }).mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), then: Promise.resolve({ data: [] }).then.bind(Promise.resolve({ data: [] })) })
    .mockReturnValueOnce({ update: updateMock });
    
    updateMock.mockReturnValue({ eq: eqMock });

    render(<BrowserRouter><ManualsManagement /></BrowserRouter>);
    await waitFor(() => expect(screen.getByTestId('toggle-m1')).toBeInTheDocument());

    screen.getByTestId('toggle-m1').click();
    
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ is_public: false });
      expect(eqMock).toHaveBeenCalledWith('id', 'm1');
      expect(toast.success).toHaveBeenCalledWith('Manual is now private');
    });
  });

  it('changes a manuals folder', async () => {
    const mockManuals = [{ id: 'm1', title: 'Product Guide', is_public: true, folder_id: 'folder-1' }];
    const updateMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), then: Promise.resolve({ data: mockManuals }).then.bind(Promise.resolve({ data: mockManuals }))
    }).mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), then: Promise.resolve({ data: [] }).then.bind(Promise.resolve({ data: [] })) })
    .mockReturnValueOnce({ update: updateMock });
    
    updateMock.mockReturnValue({ eq: eqMock });

    render(<BrowserRouter><ManualsManagement /></BrowserRouter>);
    await waitFor(() => expect(screen.getByTestId('folder-m1')).toBeInTheDocument());

    screen.getByTestId('folder-m1').click();
    
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ folder_id: 'folder-2' });
      expect(eqMock).toHaveBeenCalledWith('id', 'm1');
      expect(toast.success).toHaveBeenCalledWith('Manual folder updated');
    });
  });

  it('triggers retry processing when retry action is clicked', async () => {
    const mockManuals = [{ id: 'm1', title: 'Product Guide', rag_status: 'failed' }];
    const { manualService } = await import('@/services/manualService');
    
    (supabase.from as any).mockImplementation((table: string) => {
      const prom = table === 'manuals'
        ? Promise.resolve({ data: mockManuals, error: null })
        : Promise.resolve({ data: [], error: null });
      return { 
        select: vi.fn().mockReturnThis(), 
        eq: vi.fn().mockReturnThis(), 
        order: vi.fn().mockReturnThis(), 
        then: prom.then.bind(prom) 
      };
    });

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ 
      data: { session: { access_token: 'fake-token' } }, 
      error: null 
    } as any);

    render(<BrowserRouter><ManualsManagement /></BrowserRouter>);
    await waitFor(() => expect(screen.getByTestId('retry-m1')).toBeInTheDocument());

    screen.getByTestId('retry-m1').click();

    await waitFor(() => {
      expect(manualService.processManual).toHaveBeenCalledWith('m1', 'fake-token');
      expect(toast.success).toHaveBeenCalledWith('AI Processing restarted successfully');
      expect(screen.getByTestId('status-m1')).toHaveTextContent('processing');
    });
  });

  it('renders Create Web Manual button when user has permissions', async () => {
    (supabase.from as any).mockImplementation(() => {
      const prom = Promise.resolve({ data: [], error: null });
      return { 
        select: vi.fn().mockReturnThis(), 
        eq: vi.fn().mockReturnThis(), 
        order: vi.fn().mockReturnThis(), 
        then: prom.then.bind(prom) 
      };
    });

    render(<BrowserRouter><ManualsManagement /></BrowserRouter>);
    
    // Wait for the main UI to render
    await waitFor(() => expect(screen.getByTestId('create-web-button-header')).toBeInTheDocument());
    
    // Verify the button is clickable (not disabled by upload limit)
    expect(screen.getByTestId('create-web-button-header')).not.toBeDisabled();
  });
});
