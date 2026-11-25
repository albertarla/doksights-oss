import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderPlus, Folder, Pencil, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { EditFolderDialog } from "./EditFolderDialog";
import { DeleteFolderDialog } from "./DeleteFolderDialog";

export interface FolderData {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
}

interface FolderManagementProps {
  onFoldersChange?: () => void;
}

export function FolderManagement({ onFoldersChange }: FolderManagementProps) {
  const { user, companyId } = useAuth();
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<FolderData | null>(null);

  const fetchFolders = async () => {
    if (!companyId) return;

    const { data, error } = await supabase
      .from("folders")
      .select("id, name, description, display_order")
      .eq("company_id", companyId)
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Error fetching folders:", error);
      return;
    }

    setFolders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchFolders();
  }, [user, companyId]);

  const handleEdit = (folder: FolderData) => {
    setSelectedFolder(folder);
    setEditDialogOpen(true);
  };

  const handleDelete = (folder: FolderData) => {
    setSelectedFolder(folder);
    setDeleteDialogOpen(true);
  };

  const handleSuccess = () => {
    fetchFolders();
    onFoldersChange?.();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Folder className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Folder Management</CardTitle>
                <CardDescription>
                  Organize your documents into folders for better navigation
                </CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <FolderPlus className="h-4 w-4 mr-2" />
              New Folder
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {folders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Folder className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No folders yet. Create one to organize your documentation.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Folder className="h-4 w-4 text-primary" />
                    <div>
                      <p className="font-medium">{folder.name}</p>
                      {folder.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {folder.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(folder)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(folder)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateFolderDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleSuccess}
      />
      <EditFolderDialog
        folder={selectedFolder}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleSuccess}
      />
      <DeleteFolderDialog
        folder={selectedFolder}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={handleSuccess}
      />
    </>
  );
}
