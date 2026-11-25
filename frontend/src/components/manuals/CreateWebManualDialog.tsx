import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BookOpen, Loader2 } from 'lucide-react';

interface CreateWebManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (id: string) => void;
}

export function CreateWebManualDialog({ open, onOpenChange, onSuccess }: CreateWebManualDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!user || !title.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please provide a title.',
      });
      return;
    }

    setIsCreating(true);

    try {
      // Create manual record with manual_type = 'web'
      const { data: manualData, error: insertError } = await supabase
        .from('manuals')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          manual_type: 'web',
          extraction_status: 'pending',
          rag_status: 'pending',
        })
        .select('id')
        .single();

      if (insertError) {
        throw insertError;
      }

      toast({
        title: 'Manual created!',
        description: 'Your web manual has been created successfully.',
      });

      // Reset form and close
      setTitle('');
      setDescription('');
      onOpenChange(false);
      onSuccess(manualData.id);
    } catch (error: any) {
      console.error('Create error:', error);
      
      let errorMessage = 'Failed to create manual.';
      if (error && error.message) {
        if (error.message.includes('License limit reached')) {
          errorMessage = error.message;
        } else {
          errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        variant: 'destructive',
        title: 'Creation failed',
        description: errorMessage,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setTitle('');
      setDescription('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Create Web Manual</DialogTitle>
          <DialogDescription>
            Create a new markdown-based manual to author directly in DokSights.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="web-title">Title *</Label>
            <Input
              id="web-title"
              placeholder="e.g., Developer API Guide"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isCreating}
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="web-description">Description (optional)</Label>
            <Textarea
              id="web-description"
              placeholder="Brief description of this manual..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isCreating}
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!title.trim() || isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Create Manual
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
