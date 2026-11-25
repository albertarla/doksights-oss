import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ImagePlus, Trash2, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface WebManualImage {
  id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  created_at: string;
  publicUrl?: string;
}

interface ImageLibraryProps {
  manualId: string;
  onInsert: (url: string, fileName: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function ImageLibrary({ manualId, onInsert }: ImageLibraryProps) {
  const { user } = useAuth();
  const [images, setImages] = useState<WebManualImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebManualImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchImages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('web_manual_images')
      .select('id, storage_path, file_name, file_size, created_at')
      .eq('manual_id', manualId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch images:', error);
      toast.error('Failed to load images');
      setLoading(false);
      return;
    }

    // Attach public URLs for previewing in the grid
    const withUrls = data.map((img) => {
      const { data: publicUrlData } = supabase.storage
        .from('web_images')
        .getPublicUrl(img.storage_path);
      return { ...img, publicUrl: publicUrlData.publicUrl };
    });

    setImages(withUrls);
    setLoading(false);
  };

  useEffect(() => {
    fetchImages();
  }, [manualId]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }

    const MAX_SIZE_MB = Number(import.meta.env.VITE_MAX_IMAGE_SIZE_MB) || 20;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Image must be smaller than ${MAX_SIZE_MB} MB.`);
      return;
    }

    setUploading(true);
    const toastId = toast.loading(`Uploading ${file.name}...`);

    try {
      const ext = file.name.split('.').pop();
      const storagePath = `${user?.id}/web_images/${manualId}/${Date.now()}_${file.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('web_images')
        .upload(storagePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      // Register in DB
      const { error: dbError } = await supabase
        .from('web_manual_images')
        .insert({
          manual_id: manualId,
          storage_path: storagePath,
          file_name: file.name,
          file_size: file.size,
        });

      if (dbError) throw dbError;

      // Increment file_size on manuals table
      const { data: manualData } = await supabase
        .from('manuals')
        .select('file_size')
        .eq('id', manualId)
        .single();

      const currentSize = manualData?.file_size ?? 0;
      await supabase
        .from('manuals')
        .update({ file_size: currentSize + file.size })
        .eq('id', manualId);

      toast.success(`${file.name} uploaded successfully.`, { id: toastId });
      await fetchImages();
    } catch (err: any) {
      console.error('Upload failed:', err);
      toast.error(err.message || 'Upload failed.', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleCopyUrl = (img: WebManualImage) => {
    navigator.clipboard.writeText(`![${img.file_name}](storage://${img.storage_path})`);
    setCopiedId(img.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Image markdown copied to clipboard');
  };

  const handleInsert = (img: WebManualImage) => {
    onInsert(`storage://${img.storage_path}`, img.file_name);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      // Remove from storage
      await supabase.storage.from('web_images').remove([deleteTarget.storage_path]);

      // Remove from DB
      const { error: dbError } = await supabase
        .from('web_manual_images')
        .delete()
        .eq('id', deleteTarget.id);

      if (dbError) throw dbError;

      // Decrement file_size on manuals
      const { data: manualData } = await supabase
        .from('manuals')
        .select('file_size')
        .eq('id', manualId)
        .single();

      const currentSize = manualData?.file_size ?? 0;
      await supabase
        .from('manuals')
        .update({ file_size: Math.max(0, currentSize - deleteTarget.file_size) })
        .eq('id', manualId);

      toast.success(`${deleteTarget.file_name} deleted.`);
      setImages((prev) => prev.filter((img) => img.id !== deleteTarget.id));
    } catch (err: any) {
      console.error('Delete failed:', err);
      toast.error(err.message || 'Failed to delete image.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="image-library">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Image Library
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={handleUploadClick}
          disabled={uploading}
          data-testid="upload-image-button"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ImagePlus className="h-3 w-3" />
          )}
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          data-testid="image-file-input"
        />
      </div>

      {/* Image Grid */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {loading ? (
            <div className="grid grid-cols-2 gap-2">
              {Array(4).fill(0).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs border border-dashed rounded-md">
              <ImagePlus className="h-6 w-6 mx-auto mb-2 opacity-40" />
              No images yet. Upload one to get started.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="group relative rounded-md overflow-hidden border border-border bg-muted/30"
                  data-testid={`image-item-${img.id}`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                    <img
                      src={img.publicUrl}
                      alt={img.file_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  {/* Info bar */}
                  <div className="p-1.5 text-[10px] text-muted-foreground truncate">
                    <span className="block truncate" title={img.file_name}>
                      {img.file_name}
                    </span>
                    <span>{formatBytes(img.file_size)}</span>
                  </div>

                  {/* Action overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      className="h-7 text-xs w-28"
                      onClick={() => handleInsert(img)}
                      data-testid={`insert-image-${img.id}`}
                    >
                      Insert
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs w-28 gap-1"
                      onClick={() => handleCopyUrl(img)}
                    >
                      {copiedId === img.id ? (
                        <><Check className="h-3 w-3" />Copied!</>
                      ) : (
                        <><Copy className="h-3 w-3" />Copy URL</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs w-28 gap-1"
                      onClick={() => setDeleteTarget(img)}
                      data-testid={`delete-image-${img.id}`}
                    >
                      <Trash2 className="h-3 w-3" />Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Image</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>"{deleteTarget?.file_name}"</strong>? Any
              section content that references this image will show a broken image. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-image"
            >
              {deleting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
              ) : (
                'Delete Image'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
