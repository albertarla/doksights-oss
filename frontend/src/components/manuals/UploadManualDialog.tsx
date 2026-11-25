import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, FileText, Loader2, X } from 'lucide-react';


interface UploadManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UploadManualDialog({ open, onOpenChange, onSuccess }: UploadManualDialogProps) {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFile = acceptedFiles.find(f => f.type === 'application/pdf');
    if (pdfFile) {
      setFile(pdfFile);
      if (!title) {
        setTitle(pdfFile.name.replace(/\.pdf$/i, ''));
      }
    } else {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload a PDF file.',
      });
    }
  }, [title, toast]);

  const maxSizeMb = Number(import.meta.env.VITE_MAX_MANUAL_SIZE_MB) || 20;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    maxSize: maxSizeMb * 1024 * 1024,
  });

  const handleUpload = async () => {
    if (!file || !user || !title.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please provide a title and select a PDF file.',
      });
      return;
    }

    setIsUploading(true);

    try {
      // Upload file to storage
      const sanitizedFileName = file.name.replace(/[^ -~]/g, '_').replace(/\s+/g, '_');
      const filePath = `${user.id}/${Date.now()}-${sanitizedFileName}`;
      const { error: uploadError } = await supabase.storage
        .from('manuals')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      // Create manual record
      const { data: manualData, error: insertError } = await supabase
        .from('manuals')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          extraction_status: 'pending',
        })
        .select('id')
        .single();

      if (insertError) {
        // Clean up uploaded file if insert fails
        await supabase.storage.from('manuals').remove([filePath]);
        throw insertError;
      }

      // Trigger PDF extraction + RAG indexing in backend (fire and forget)
      const accessToken = session?.access_token;
      if (accessToken) {
        import('@/services/manualService').then(({ manualService }) => {
          manualService.processManual(manualData.id, accessToken)
            .catch(err => console.error('Manual processing trigger failed:', err));
        });
      }

      toast({
        title: 'Manual uploaded!',
        description: 'Your manual has been uploaded successfully.',
      });

      // Reset form and close
      setFile(null);
      setTitle('');
      setDescription('');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Upload error:', error);
      
      let errorMessage = 'Failed to upload manual.';
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
        title: 'Upload failed',
        description: errorMessage,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setFile(null);
      setTitle('');
      setDescription('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl w-full overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Upload Manual</DialogTitle>
          <DialogDescription>
            Upload a PDF manual to share with your customers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* File dropzone */}
          {!file ? (
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }
              `}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
              {isDragActive ? (
                <p className="text-primary font-medium">Drop the PDF here...</p>
              ) : (
                <>
                  <p className="font-medium">Drag & drop a PDF file here</p>
                  <p className="text-sm text-muted-foreground mt-1">or click to browse (max {maxSizeMb}MB)</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4 bg-muted rounded-lg overflow-hidden">
              <FileText className="h-8 w-8 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="font-medium break-all leading-snug">{file.name}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFile(null)}
                disabled={isUploading}
                className="flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Textarea
              id="title"
              placeholder="e.g., Product Installation Guide"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isUploading}
              maxLength={200}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Brief description of this manual..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isUploading}
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={isUploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={!file || !title.trim() || isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Manual
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
