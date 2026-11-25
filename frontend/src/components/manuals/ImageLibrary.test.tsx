import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageLibrary } from './ImageLibrary';
import { supabase } from '@/integrations/supabase/client';
import * as AuthContextModule from '@/contexts/AuthContext';

const mockImages = [
  { id: 'img-1', storage_path: 'web_images/m1/img1.png', file_name: 'img1.png', file_size: 10240, created_at: '2024-01-01T00:00:00Z' },
  { id: 'img-2', storage_path: 'web_images/m1/img2.jpg', file_name: 'img2.jpg', file_size: 20480, created_at: '2024-01-02T00:00:00Z' },
];

// Mock supabase
vi.mock('@/integrations/supabase/client', () => {
  const storageRemoveMock = vi.fn().mockResolvedValue({ data: {}, error: null });
  const storageUploadMock = vi.fn().mockResolvedValue({ data: {}, error: null });
  const getPublicUrlMock = vi.fn((path: string) => ({
    data: { publicUrl: `https://cdn.example.com/${path}` },
  }));

  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockImages, error: null }),
        insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
        delete: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { file_size: 100000 }, error: null }),
        update: vi.fn().mockResolvedValue({ data: {}, error: null }),
      })),
      storage: {
        from: vi.fn(() => ({
          upload: storageUploadMock,
          remove: storageRemoveMock,
          getPublicUrl: getPublicUrlMock,
        })),
      },
    },
  };
});

describe('ImageLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock useAuth
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'test-user-id', email: 'test@example.com' },
      session: { user: { id: 'test-user-id' } },
      loading: false,
      permissions: [],
      hasPermission: vi.fn().mockReturnValue(true),
      isSuperadmin: false,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    } as any);

    // Reset the from mock to return images list by default
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'web_manual_images') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockImages, error: null }),
          insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
          delete: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockImages[0], error: null }),
        };
      }
      if (table === 'manuals') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { file_size: 100000 }, error: null }),
          update: vi.fn().mockReturnThis(),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
  });

  it('renders the image library with uploaded images', async () => {
    render(<ImageLibrary manualId="m1" onInsert={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('image-library')).toBeInTheDocument();
      expect(screen.getByText('img1.png')).toBeInTheDocument();
      expect(screen.getByText('img2.jpg')).toBeInTheDocument();
    });
  });

  it('shows empty state when no images are uploaded', async () => {
    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    render(<ImageLibrary manualId="m1" onInsert={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No images yet/i)).toBeInTheDocument();
    });
  });

  it('calls onInsert with correct url and filename when Insert is clicked', async () => {
    const onInsert = vi.fn();
    render(<ImageLibrary manualId="m1" onInsert={onInsert} />);

    await waitFor(() => expect(screen.getByText('img1.png')).toBeInTheDocument());

    // Hover to reveal buttons — fireEvent.mouseOver triggers group hover
    const imageItem = screen.getByTestId('image-item-img-1');
    fireEvent.mouseOver(imageItem);

    const insertBtn = screen.getByTestId('insert-image-img-1');
    fireEvent.click(insertBtn);

    expect(onInsert).toHaveBeenCalledWith(
      expect.stringContaining('img1.png'),
      'img1.png'
    );
  });

  it('opens delete dialog when delete button is clicked', async () => {
    render(<ImageLibrary manualId="m1" onInsert={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('img1.png')).toBeInTheDocument());

    const deleteBtn = screen.getByTestId('delete-image-img-1');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      // Dialog heading should be visible; use heading role to avoid ambiguity with the action button
      expect(screen.getByRole('heading', { name: /delete image/i })).toBeInTheDocument();
      // img1.png appears in both the image card and the dialog description
      expect(screen.getAllByText(/img1\.png/).length).toBeGreaterThan(0);
    });
  });

  it('calls storage remove and DB delete when delete is confirmed', async () => {
    const storageFrom = supabase.storage.from as any;
    const removeMock = vi.fn().mockResolvedValue({ error: null });
    storageFrom.mockReturnValue({
      upload: vi.fn(),
      remove: removeMock,
      getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example.com/${path}` } })),
    });

    const dbDeleteMock = vi.fn().mockReturnThis();
    const dbEqMock = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'web_manual_images') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockImages, error: null }),
          delete: () => ({ eq: dbEqMock }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { file_size: 100000 }, error: null }),
        update: vi.fn().mockReturnThis(),
      };
    });

    render(<ImageLibrary manualId="m1" onInsert={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('img1.png')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('delete-image-img-1'));
    await waitFor(() => expect(screen.getByTestId('confirm-delete-image')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('confirm-delete-image'));

    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledWith(['web_images/m1/img1.png']);
      expect(dbEqMock).toHaveBeenCalledWith('id', 'img-1');
    });
  });

  it('uploads a file and inserts it into the DB', async () => {
    const uploadMock = vi.fn().mockResolvedValue({ data: {}, error: null });
    const insertMock = vi.fn().mockResolvedValue({ data: {}, error: null });

    (supabase.storage.from as any).mockReturnValue({
      upload: uploadMock,
      remove: vi.fn(),
      getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example.com/${path}` } })),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'web_manual_images') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: insertMock,
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { file_size: 0 }, error: null }),
        update: vi.fn().mockReturnThis(),
      };
    });

    render(<ImageLibrary manualId="m1" onInsert={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('upload-image-button')).toBeInTheDocument());

    const file = new File(['hello'], 'test.png', { type: 'image/png' });
    const input = screen.getByTestId('image-file-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalled();
      expect(insertMock).toHaveBeenCalled();
    });
  });
});
