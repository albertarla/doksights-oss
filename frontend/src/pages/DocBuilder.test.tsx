import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DocBuilder from './DocBuilder';
import { supabase } from '@/integrations/supabase/client';
import * as AuthContextModule from '@/contexts/AuthContext';
import * as PermissionsModule from '@/hooks/usePermissions';
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

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

// Mock child components and libraries
vi.mock('react-markdown', () => ({
  default: ({ children }: any) => <div data-testid="markdown-preview">{children}</div>,
}));
vi.mock('remark-gfm', () => ({ default: {} }));
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div>{children}</div>,
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(),
}));
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  verticalListSortingStrategy: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  }),
  arrayMove: (arr: any) => arr,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'man-1' }),
  };
});

describe('DocBuilder Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1' },
      session: { access_token: 'token' },
    } as any);
    vi.spyOn(PermissionsModule, 'usePermissions').mockReturnValue({
      canEditManuals: true,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading state then manual content', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      let data = null;
      if (table === 'manuals') data = { id: 'man-1', title: 'Web Manual', manual_type: 'web' };
      if (table === 'manual_sections') data = [{ id: 's1', title: 'Section 1', content: 'Content 1', display_order: 0 }];
      
      const prom = Promise.resolve({ data, error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: prom.then.bind(prom),
      };
    });

    render(<BrowserRouter><DocBuilder /></BrowserRouter>);
    
    await waitFor(() => expect(screen.getByText('Web Manual')).toBeInTheDocument(), { timeout: 3000 });
    await waitFor(() => {
      expect(screen.getByText('Section 1')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Content 1')).toBeInTheDocument();
    });
  });

  it('adds a new section', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      const data = table === 'manuals' ? { id: 'man-1', title: 'Web Manual', manual_type: 'web' } : [];
      const prom = Promise.resolve({ data, error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: prom.then.bind(prom),
      };
    });

    render(<BrowserRouter><DocBuilder /></BrowserRouter>);
    
    await waitFor(() => expect(screen.getByText('Web Manual')).toBeInTheDocument());
    
    // Use querySelector for the plus button since it's an icon button without text
    const addButton = screen.getByTitle('Add Section'); // I'll add this title to the component
    fireEvent.click(addButton);

    expect(screen.getByDisplayValue('New Section')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('saves changes', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      const data = table === 'manuals' ? { id: 'man-1', title: 'Web Manual', manual_type: 'web' } : [];
      const prom = Promise.resolve({ data, error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        then: prom.then.bind(prom),
      };
    });

    render(<BrowserRouter><DocBuilder /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('Web Manual')).toBeInTheDocument());

    // Add section to trigger dirty state
    const addButton = screen.getByTitle('Add Section');
    fireEvent.click(addButton);
    
    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('manual_sections');
      expect(toast.success).toHaveBeenCalledWith('Saved successfully');
    });
  });

  it('detects and restores a local draft', async () => {
    const draftContent = [{ id: 's-draft', title: 'Draft Section', content: 'Draft Content', display_order: 0 }];
    localStorage.setItem('web_manual_draft_man-1', JSON.stringify(draftContent));

    (supabase.from as any).mockImplementation((table: string) => {
      const data = table === 'manuals' ? { id: 'man-1', title: 'Web Manual', manual_type: 'web' } : [];
      const prom = Promise.resolve({ data, error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: prom.then.bind(prom),
      };
    });

    render(<BrowserRouter><DocBuilder /></BrowserRouter>);
    
    await waitFor(() => expect(screen.getByText(/unsaved draft/i)).toBeInTheDocument());

    const restoreButton = screen.getByText('Restore Draft');
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(screen.getByText('Draft Section')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Draft Content')).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Draft restored');
    });
  });

  it('discards a local draft', async () => {
    const draftContent = [{ id: 's-draft', title: 'Draft Section', content: 'Draft Content', display_order: 0 }];
    localStorage.setItem('web_manual_draft_man-1', JSON.stringify(draftContent));

    (supabase.from as any).mockImplementation((table: string) => {
      const data = table === 'manuals' ? { id: 'man-1', title: 'Web Manual', manual_type: 'web' } : [];
      const prom = Promise.resolve({ data, error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: prom.then.bind(prom),
      };
    });

    render(<BrowserRouter><DocBuilder /></BrowserRouter>);
    
    await waitFor(() => expect(screen.getByText(/unsaved draft/i)).toBeInTheDocument());

    const discardButton = screen.getByText('Discard');
    fireEvent.click(discardButton);

    await waitFor(() => {
      expect(screen.queryByText(/unsaved draft/i)).not.toBeInTheDocument();
      expect(localStorage.removeItem).toHaveBeenCalledWith('web_manual_draft_man-1');
    });
  });

  it('clears draft after successful save', async () => {
    localStorage.setItem('web_manual_draft_man-1', 'some draft content');

    (supabase.from as any).mockImplementation((table: string) => {
      const data = table === 'manuals' ? { id: 'man-1', title: 'Web Manual', manual_type: 'web' } : [];
      const prom = Promise.resolve({ data, error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        then: prom.then.bind(prom),
      };
    });

    render(<BrowserRouter><DocBuilder /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('Web Manual')).toBeInTheDocument());

    // Trigger unsaved changes
    const addButton = screen.getByTitle('Add Section');
    fireEvent.click(addButton);
    
    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(localStorage.removeItem).toHaveBeenCalledWith('web_manual_draft_man-1');
      expect(toast.success).toHaveBeenCalledWith('Saved successfully');
    });
  });

  it('auto-saves draft to localStorage after delay', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      const data = table === 'manuals' ? { id: 'man-1', title: 'Web Manual', manual_type: 'web' } : [];
      const prom = Promise.resolve({ data, error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: prom.then.bind(prom),
      };
    });

    render(<BrowserRouter><DocBuilder /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('Web Manual')).toBeInTheDocument());

    vi.useFakeTimers();

    // Trigger unsaved changes
    const addButton = screen.getByTitle('Add Section');
    fireEvent.click(addButton);

    // Should not have saved immediately
    expect(localStorage.setItem).not.toHaveBeenCalledWith('web_manual_draft_man-1', expect.any(String));

    // Advance timers
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(localStorage.setItem).toHaveBeenCalledWith('web_manual_draft_man-1', expect.stringContaining('New Section'));
  });
});
