import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FolderData } from "./FolderManagement";

interface DeleteFolderDialogProps {
  folder: FolderData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeleteFolderDialog({
  folder,
  open,
  onOpenChange,
  onSuccess,
}: DeleteFolderDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!folder) return;

    setDeleting(true);

    try {
      // First, unassign all manuals from this folder
      const { error: updateError } = await supabase
        .from("manuals")
        .update({ folder_id: null })
        .eq("folder_id", folder.id);

      if (updateError) {
        console.error("Error unassigning manuals:", updateError);
        toast.error("Failed to unassign manuals from folder");
        return;
      }

      // Then delete the folder
      const { error } = await supabase
        .from("folders")
        .delete()
        .eq("id", folder.id);

      if (error) {
        console.error("Error deleting folder:", error);
        toast.error("Failed to delete folder");
        return;
      }

      toast.success("Folder deleted");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error("An unexpected error occurred");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Folder</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{folder?.name}"? Documents in this
            folder will be moved to "Uncategorized" but won't be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete Folder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}