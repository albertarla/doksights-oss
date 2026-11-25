import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

interface Manual {
  id: string;
  title: string;
  file_path: string | null;
  manual_type?: 'pdf' | 'web';
}

interface DeleteManualDialogProps {
  manual: Manual | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeleteManualDialog({ manual, open, onOpenChange, onSuccess }: DeleteManualDialogProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!manual) return;

    setIsDeleting(true);

    try {
      // ── PDF: delete the single PDF file from storage ──────────────────────────
      if (manual.manual_type === 'pdf' && manual.file_path) {
        const { error: storageError } = await supabase.storage
          .from('manuals')
          .remove([manual.file_path]);

        if (storageError) {
          console.warn('PDF storage deletion warning:', storageError);
          // Continue — the file might already be gone
        }
      }

      // ── Web Manual: bulk-delete all images from storage ──────────────────────
      if (manual.manual_type === 'web' || !manual.manual_type) {
        const { data: imageRows } = await supabase
          .from('web_manual_images')
          .select('storage_path')
          .eq('manual_id', manual.id);

        const paths = (imageRows ?? []).map((r) => r.storage_path).filter(Boolean);
        if (paths.length > 0) {
          const { error: imgStorageError } = await supabase.storage
            .from('manuals')
            .remove(paths);

          if (imgStorageError) {
            console.warn('Image storage deletion warning:', imgStorageError);
          }
        }
      }

      // ── Delete from database ─────────────────────────────────────────────────
      // ON DELETE CASCADE removes: manual_sections, manual_chunks, web_manual_images rows
      const { error: dbError } = await supabase
        .from('manuals')
        .delete()
        .eq('id', manual.id);

      if (dbError) throw dbError;

      toast({
        title: 'Manual deleted',
        description: 'The manual and all its associated files have been removed.',
      });

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete manual.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Manual</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{manual?.title}&quot;? This will permanently
            remove the manual, all its sections, and any uploaded images. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Manual'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
