import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadManualDialog } from './UploadManualDialog';
import * as AuthContextModule from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { manualService } from '@/services/manualService';


// Mock the processManual service explicitly
vi.mock('@/services/manualService', () => ({
  manualService: {
    processManual: vi.fn().mockResolvedValue({}),
  },
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
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
  session: { access_token: 'token-123' },
};

describe('UploadManualDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(mockAuth as any);
  });

  it('renders correctly and accepts valid PDF drops', async () => {
    render(<UploadManualDialog open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />);
    
    expect(screen.getByRole('heading', { name: 'Upload Manual' })).toBeInTheDocument();
    expect(screen.getByTestId('dropzone')).toBeInTheDocument();

    const file = new File(['pdf-content'], 'test-manual.pdf', { type: 'application/pdf' });
    await mockOnDrop([file]);

    // Checks that the title was auto-filled (without .pdf)
    await waitFor(() => {
      expect(screen.getByLabelText('Title *')).toHaveValue('test-manual');
      expect(screen.getByText('test-manual.pdf')).toBeInTheDocument();
    });
  });

  it('rejects non-PDF files and shows error toast', async () => {
    render(<UploadManualDialog open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />);
    
    const file = new File(['text'], 'test-manual.txt', { type: 'text/plain' });
    await mockOnDrop([file]);

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Invalid file type',
      variant: 'destructive',
    }));
  });

  it('disables the submit button if file or title is missing', async () => {
    render(<UploadManualDialog open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />);
    
    // Initially no file or title, button should be disabled
    const submitBtn = screen.getByRole('button', { name: /Upload Manual/i });
    expect(submitBtn).toBeDisabled();
  });

  it('successful upload calls Supabase storage, insert, and processManual', async () => {
    const mockUpload = vi.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as any).mockReturnValue({ upload: mockUpload });
    
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'manual-1' }, error: null }),
    });
    (supabase.from as any).mockReturnValue({ insert: mockInsert });

    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();

    render(<UploadManualDialog open={true} onOpenChange={onOpenChange} onSuccess={onSuccess} />);
    
    const file = new File(['pdf'], 'guide.pdf', { type: 'application/pdf' });
    await mockOnDrop([file]);

    // Edit description
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'A vital guide' } });

    // Click upload
    fireEvent.click(screen.getByRole('button', { name: /Upload Manual/i }));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        title: 'guide',
        description: 'A vital guide',
        file_name: 'guide.pdf',
      }));
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Manual uploaded!' }));
      expect(onSuccess).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    // Verify dynamic import trigger by waiting a tick
    await waitFor(() => {
       expect(manualService.processManual).toHaveBeenCalledWith('manual-1', 'token-123');
    });
  });
});
