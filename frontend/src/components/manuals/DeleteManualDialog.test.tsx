import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteManualDialog } from './DeleteManualDialog';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}));

const pdfManual = {
  id: 'pdf-1',
  title: 'PDF Manual',
  file_path: 'pdfs/company/my-file.pdf',
  manual_type: 'pdf' as const,
};

const webManual = {
  id: 'web-1',
  title: 'Web Manual',
  file_path: null,
  manual_type: 'web' as const,
};

describe('DeleteManualDialog', () => {
  let removeMock: ReturnType<typeof vi.fn>;
  let dbDeleteChainMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    removeMock = vi.fn().mockResolvedValue({ error: null });
    dbDeleteChainMock = vi.fn().mockResolvedValue({ error: null });

    (supabase.storage.from as any).mockReturnValue({
      remove: removeMock,
    });
  });

  it('renders the dialog with correct manual title', () => {
    render(
      <DeleteManualDialog
        manual={pdfManual}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(screen.getByText(/PDF Manual/i)).toBeInTheDocument();
    // Use getByRole to specifically target the heading, not the button
    expect(screen.getByRole('heading', { name: 'Delete Manual' })).toBeInTheDocument();
  });

  it('deletes PDF file from storage and DB row when confirmed', async () => {
    (supabase.from as any).mockReturnValue({
      delete: () => ({ eq: dbDeleteChainMock }),
    });

    const onSuccess = vi.fn();
    render(
      <DeleteManualDialog
        manual={pdfManual}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />
    );

    // Use getByRole to target the button specifically (not the heading)
    fireEvent.click(screen.getByRole('button', { name: /delete manual/i }));

    await waitFor(() => {
      // Storage: should remove the PDF file
      expect(removeMock).toHaveBeenCalledWith(['pdfs/company/my-file.pdf']);
      // DB: should delete the manual row
      expect(dbDeleteChainMock).toHaveBeenCalledWith('id', 'pdf-1');
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('skips PDF storage deletion when file_path is null (web manual)', async () => {
    const imagesFetchMock = vi.fn().mockResolvedValue({ data: [], error: null });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'web_manual_images') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: imagesFetchMock,
        };
      }
      return {
        delete: () => ({ eq: dbDeleteChainMock }),
      };
    });

    render(
      <DeleteManualDialog
        manual={webManual}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete manual/i }));

    await waitFor(() => {
      // Storage.remove should NOT be called with null or undefined PDF path
      expect(removeMock).not.toHaveBeenCalledWith([null]);
      expect(removeMock).not.toHaveBeenCalledWith([undefined]);
    });
  });

  it('bulk-deletes web manual images from storage before DB delete', async () => {
    const imagePaths = ['web_images/web-1/img1.png', 'web_images/web-1/img2.jpg'];
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'web_manual_images') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: imagePaths.map((p, i) => ({ storage_path: p, id: `img-${i}` })),
            error: null,
          }),
        };
      }
      return {
        delete: () => ({ eq: dbDeleteChainMock }),
      };
    });

    const onSuccess = vi.fn();
    render(
      <DeleteManualDialog
        manual={webManual}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete manual/i }));

    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledWith(imagePaths);
      expect(dbDeleteChainMock).toHaveBeenCalledWith('id', 'web-1');
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('does not crash when manual is null', () => {
    render(
      <DeleteManualDialog
        manual={null}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    // Dialog renders safely — heading is present
    expect(screen.getByRole('heading', { name: 'Delete Manual' })).toBeInTheDocument();
  });
});
