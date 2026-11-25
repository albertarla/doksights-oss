import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { manualService } from '@/services/manualService';

interface Manual {
  id: string;
  title: string;
  description: string | null;
  manual_type?: 'pdf' | 'web';
  file_path?: string | null;
  file_name?: string | null;
}

interface EditManualDialogProps {
  manual: Manual | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditManualDialog({ manual, open, onOpenChange, onSuccess }: EditManualDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(manual?.title || '');
  const [description, setDescription] = useState(manual?.description || '');
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Update form when manual changes
  useState(() => {
    if (manual) {
      setTitle(manual.title);
      setDescription(manual.description || '');
      setFile(null);
    }
  });

  const handleSave = async () => {
    if (!manual || !title.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please provide a title.',
      });
      return;
    }

    setIsSaving(true);

    try {
      const updateData: any = {
        title: title.trim(),
        description: description.trim() || null,
      };

      // Handle file replacement if it's a PDF manual
      if (manual.manual_type === 'pdf' && file) {
        const fileExt = file.name.split('.').pop();
        const filePath = `${manual.id}-${Math.random()}.${fileExt}`;

        // Upload new file
        const { error: uploadError } = await supabase.storage
          .from('manuals')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Add file metadata to update
        updateData.file_path = filePath;
        updateData.file_name = file.name;
        updateData.file_size = file.size;
        // Trigger re-processing
        updateData.rag_status = 'pending';
        updateData.extraction_status = 'pending';
      }

      const { error } = await supabase
        .from('manuals')
        .update(updateData)
        .eq('id', manual.id);

      if (error) throw error;

      // If file changed, trigger the processing automatically
      if (updateData.file_path) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
           // We don't await this as it's an async background task on the backend
           manualService.processManual(manual.id, session.access_token)
             .catch(err => console.error("Auto-process trigger failed:", err));
        }
      }

      toast({
        title: 'Manual updated!',
        description: updateData.file_path 
          ? 'Manual details and file updated. AI re-indexing started.' 
          : 'Your changes have been saved.',
      });

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Update error:', error);
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update manual.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Edit Manual</DialogTitle>
          <DialogDescription>
            Update the title, description, or replace the file for this manual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title *</Label>
            <Input
              id="edit-title"
              placeholder="e.g., Product Installation Guide"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSaving}
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description (optional)</Label>
            <Textarea
              id="edit-description"
              placeholder="Brief description of this manual..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSaving}
              rows={3}
              maxLength={500}
            />
          </div>

          {/* File Replacement (only for PDF manuals) */}
          {manual?.manual_type !== 'web' && (
            <div className="space-y-2">
              <Label htmlFor="edit-file">Replace PDF File (optional)</Label>
              <div className="flex flex-col gap-2">
                <Input
                  id="edit-file"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  disabled={isSaving}
                />
                {manual?.file_name && !file && (
                  <p className="text-xs text-muted-foreground">
                    Current file: <span className="font-medium">{manual.file_name}</span>
                  </p>
                )}
                {file && (
                  <p className="text-xs text-primary font-medium">
                    New file selected: {file.name}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!title.trim() || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
