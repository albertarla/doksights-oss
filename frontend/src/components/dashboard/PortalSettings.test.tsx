import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PortalSettings } from './PortalSettings';
import * as AuthContextModule from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const mockToast = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (msg: string) => mockToast(msg),
    error: (msg: string) => mockToast(msg),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}));

export let mockOnDrop: (files: File[]) => void;

vi.mock('react-dropzone', () => ({
  useDropzone: ({ onDrop }: any) => {
    mockOnDrop = onDrop;
    return {
      getRootProps: () => ({ 'data-testid': 'dropzone', onClick: () => {} }),
      getInputProps: () => ({ 'data-testid': 'dropzone-input' }),
      isDragActive: false,
    };
  },
}));

const mockAuth = {
  user: { id: 'user-1' },
  companyId: 'company-1',
};

const defaultCompanyData = {
  slug: 'test-co',
  portal_enabled: false,
  portal_description: 'Hello world',
  logo_url: null,
  portal_primary_color: '#ff0000',
  portal_background_color: '#ffffff',
};

describe('PortalSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(mockAuth as any);
    
    // Default fetch mock
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: defaultCompanyData, error: null }),
      update: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }), // duplicate slug check pass
    });
  });

  it('renders loading spinner initially, then populates form', async () => {
    let resolvePromise: any;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnValue(promise),
    });

    render(<PortalSettings />);

    // Initial state: loading
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();

    // Resolve fetch
    resolvePromise({ data: defaultCompanyData, error: null });

    await waitFor(() => {
      expect(screen.getByLabelText('Portal URL')).toHaveValue('test-co');
      expect(screen.getByLabelText('Portal Description')).toHaveValue('Hello world');
    });
  });

  it('validates URL slug and displays error message', async () => {
    render(<PortalSettings />);

    await waitFor(() => expect(screen.getByLabelText('Portal URL')).toBeInTheDocument());

    const input = screen.getByLabelText('Portal URL');

    // Too short
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(screen.getByText('Slug must be at least 3 characters')).toBeInTheDocument();

    // Invalid characters automatically removed by sanitization, so we can't test invalid chars easily 
    // without typing uppercase and seeing it lowercase.
    fireEvent.change(input, { target: { value: 'UPPER-CASE' } });
    expect(input).toHaveValue('upper-case');

    // Starts with hyphen
    fireEvent.change(input, { target: { value: '-bad-slug' } });
    expect(screen.getByText('Slug cannot start or end with a hyphen')).toBeInTheDocument();
  });

  it('successful logo file drop triggers Supabase storage API', async () => {
    const mockUpload = vi.fn().mockResolvedValue({ error: null });
    const mockGetPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://img.co/logo.png' } });
    
    (supabase.storage.from as any).mockReturnValue({
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
    });

    render(<PortalSettings />);
    await waitFor(() => expect(screen.getByTestId('dropzone')).toBeInTheDocument());

    const file = new File(['dummy content'], 'my-logo.png', { type: 'image/png' });
    
    // Simulate drop
    await mockOnDrop([file]);

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith('user-1/logo.png', file, { upsert: true });
      expect(mockGetPublicUrl).toHaveBeenCalledWith('user-1/logo.png');
      expect(mockToast).toHaveBeenCalledWith("Logo uploaded! Don't forget to save settings.");
    });
  });

  it('save Settings button persists changes to Supabase', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: defaultCompanyData, error: null }),
      update: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }), // Mock no existing slug
      then: (cb: any) => Promise.resolve({ error: null }).then(cb),
    });

    // Override the specific 'update' behavior
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'companies') {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: defaultCompanyData, error: null }),
          neq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          update: mockUpdate,
        };
        mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
        return chain;
      }
    });

    render(<PortalSettings />);
    await waitFor(() => expect(screen.getByLabelText('Portal URL')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Portal URL'), { target: { value: 'new-slug' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        slug: 'new-slug',
      }));
      expect(mockToast).toHaveBeenCalledWith('Portal settings saved');
    });
  });

  it('toggling Enable Portal displays preview buttons', async () => {
    // Initial state holds portal_enabled: false
    render(<PortalSettings />);
    await waitFor(() => expect(screen.getByLabelText('Portal URL')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /preview portal/i })).not.toBeInTheDocument();

    const toggle = screen.getByRole('switch', { name: 'Enable Portal' });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /preview portal/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    });
  });
});
