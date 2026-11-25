import { useEffect, useState, useCallback } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { FolderOpen, Plus, ArrowLeft, Upload, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UploadManualDialog } from '@/components/manuals/UploadManualDialog';
import { CreateWebManualDialog } from '@/components/manuals/CreateWebManualDialog';
import { EditManualDialog } from '@/components/manuals/EditManualDialog';
import { DeleteManualDialog } from '@/components/manuals/DeleteManualDialog';
import { ManualCard } from '@/components/manuals/ManualCard';
import { FolderManagement } from '@/components/folders/FolderManagement';
import { toast } from 'sonner';
import { manualService } from '@/services/manualService';

interface Folder {
    id: string;
    name: string;
}

interface Manual {
    id: string;
    title: string;
    description: string | null;
    file_path: string;
    file_name: string;
    file_size: number;
    created_at: string;
    is_public: boolean;
    folder_id: string | null;
    rag_status: 'pending' | 'processing' | 'completed' | 'failed';
    rag_error: string | null;
    manual_type: 'pdf' | 'web';
}

const ManualsManagement = () => {
    const { user, loading, companyId, license } = useAuth();
    const { canEditManuals } = usePermissions();
    const navigate = useNavigate();

    const [manuals, setManuals] = useState<Manual[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [manualsLoading, setManualsLoading] = useState(true);

    // Dialog states
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [createWebDialogOpen, setCreateWebDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedManual, setSelectedManual] = useState<Manual | null>(null);

    useEffect(() => {
        if (!loading) {
            if (!user) {
                navigate('/auth');
            } else if (!canEditManuals) {
                navigate('/dashboard');
                toast.error("You don't have permission to manage documentation.");
            }
        }
    }, [user, loading, canEditManuals, navigate]);

    const fetchManuals = useCallback(async () => {
        if (companyId && canEditManuals) {
            setManualsLoading(true);
            const { data, error } = await supabase
                .from('manuals')
                .select(`
          id,
          title,
          description,
          file_path,
          file_name,
          file_size,
          created_at,
          is_public,
          folder_id,
          rag_status,
          rag_error,
          manual_type
        `)
                .eq('company_id', companyId)
                .order('created_at', { ascending: false });

            if (!error && data) {
                setManuals(data as Manual[]);
            }
            setManualsLoading(false);
        }
    }, [companyId, canEditManuals]);

    const fetchFolders = useCallback(async () => {
        if (companyId && canEditManuals) {
            const { data, error } = await supabase
                .from('folders')
                .select('id, name')
                .eq('company_id', companyId)
                .order('display_order', { ascending: true });

            if (!error && data) {
                setFolders(data);
            }
        }
    }, [companyId, canEditManuals]);

    useEffect(() => {
        if (user && canEditManuals) {
            fetchManuals();
            fetchFolders();
        }
    }, [user, canEditManuals, fetchManuals, fetchFolders]);

    // Real-time subscription for manual updates
    useEffect(() => {
        if (companyId && canEditManuals) {
            const channel = supabase
                .channel('manuals_updates')
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'manuals',
                        filter: `company_id=eq.${companyId}`,
                    },
                    (payload) => {
                        const updatedManual = payload.new as Manual;
                        setManuals((prev) =>
                            prev.map((m) => {
                                if (m.id === updatedManual.id) {
                                    return {
                                        ...m,
                                        rag_status: updatedManual.rag_status,
                                        rag_error: updatedManual.rag_error,
                                    };
                                }
                                return m;
                            })
                        );
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [companyId, canEditManuals]);

    const isUploadLimitReached = license ? manuals.length >= license.max_manuals : false;

    const handleEdit = (manual: Manual) => {
        setSelectedManual(manual);
        setEditDialogOpen(true);
    };

    const handleDelete = (manual: Manual) => {
        setSelectedManual(manual);
        setDeleteDialogOpen(true);
    };

    const handleTogglePublic = async (manualId: string, isPublic: boolean) => {
        if (isPublic && license) {
            const currentPublicCount = manuals.filter(m => m.is_public).length;
            if (currentPublicCount >= license.max_public_manuals) {
                toast.error(`Public manuals limit reached (${license.max_public_manuals}). Ask your instance admin to raise the limit.`);
                return;
            }
        }

        const { error } = await supabase
            .from('manuals')
            .update({ is_public: isPublic })
            .eq('id', manualId);

        if (error) {
            console.error('Error updating manual visibility:', error);

            // Try to extract a clean message from Postgres errors 
            // e.g., "License limit reached: Cannot exceed X public manuals"
            let errorMessage = error.message;
            if (errorMessage && errorMessage.includes('License limit reached')) {
                toast.error(errorMessage);
            } else {
                toast.error(error.message || 'Failed to update manual visibility');
            }
            return;
        }

        setManuals((prev) =>
            prev.map((m) => (m.id === manualId ? { ...m, is_public: isPublic } : m))
        );
        toast.success(isPublic ? 'Manual is now public' : 'Manual is now private');
    };

    const handleFolderChange = async (manualId: string, folderId: string | null) => {
        const { error } = await supabase
            .from('manuals')
            .update({ folder_id: folderId })
            .eq('id', manualId);

        if (error) {
            console.error('Error updating manual folder:', error);
            toast.error('Failed to update manual folder');
            return;
        }

        setManuals((prev) =>
            prev.map((m) => (m.id === manualId ? { ...m, folder_id: folderId } : m))
        );
        toast.success('Manual folder updated');
    };

    const handleRetryProcess = async (manualId: string) => {
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            if (!accessToken) throw new Error("No access token available");

            setManuals((prev) =>
                prev.map((m) => (m.id === manualId ? { ...m, rag_status: 'processing', rag_error: null } : m))
            );

            await manualService.processManual(manualId, accessToken);
            toast.success('AI Processing restarted successfully');
        } catch (error: any) {
            console.error('Failed to retry process:', error);
            toast.error(error.message || 'Failed to restart processing');
        }
    };

    if (loading || !user || !canEditManuals) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border bg-card">
                <div className="container flex h-16 items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                        <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground shrink-0">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="text-sm hidden sm:inline">Dashboard</span>
                        </Link>
                        <div className="h-4 w-px bg-border shrink-0" />
                        <div className="flex items-center gap-2 min-w-0">
                            <FolderOpen className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
                            <span className="font-display text-lg sm:text-xl font-medium truncate">Manuals</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setCreateWebDialogOpen(true)} disabled={isUploadLimitReached} className="shrink-0 ml-2 shadow-sm" data-testid="create-web-button-header">
                            <BookOpen className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Create Web Manual</span>
                        </Button>
                        <Button onClick={() => setUploadDialogOpen(true)} disabled={isUploadLimitReached} className="shrink-0 shadow-sm">
                            <Plus className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Upload PDF</span>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="container py-8 space-y-8">
                {isUploadLimitReached && (
                    <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
                        You have reached the maximum number of manuals ({license?.max_manuals}) for your current license plan.
                        Ask your instance admin to raise the limit.
                    </div>
                )}
                <FolderManagement onFoldersChange={fetchFolders} />

                {manualsLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                ) : manuals.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-16">
                            <div className="rounded-full bg-primary/10 p-4 mb-4">
                                <Upload className="h-8 w-8 text-primary" />
                            </div>
                            <CardTitle className="font-display text-xl mb-2">
                                Upload your first manual
                            </CardTitle>
                            <CardDescription className="text-center max-w-sm mb-6">
                                Get started by uploading a PDF manual. You'll be able to make it public
                                and share it via your company portal.
                            </CardDescription>
                            <div className="flex gap-4 justify-center mt-6">
                                <Button variant="outline" onClick={() => setCreateWebDialogOpen(true)} disabled={isUploadLimitReached} data-testid="create-web-button-empty">
                                    <BookOpen className="h-4 w-4 mr-2" />
                                    Create Web Manual
                                </Button>
                                <Button onClick={() => setUploadDialogOpen(true)} disabled={isUploadLimitReached}>
                                    <Upload className="h-4 w-4 mr-2" />
                                    Upload PDF
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        <h2 className="font-display text-xl font-medium">Your Documentation</h2>
                        <div className="grid gap-4">
                            {manuals.map((manual) => (
                                <ManualCard
                                    key={manual.id}
                                    manual={manual}
                                    folders={folders}
                                    onEdit={() => handleEdit(manual)}
                                    onDelete={() => handleDelete(manual)}
                                    onTogglePublic={handleTogglePublic}
                                    onFolderChange={handleFolderChange}
                                    onRetryProcess={handleRetryProcess}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </main>

            <UploadManualDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} onSuccess={fetchManuals} />
            <CreateWebManualDialog
                open={createWebDialogOpen}
                onOpenChange={setCreateWebDialogOpen}
                onSuccess={(id) => {
                    fetchManuals();
                    navigate(`/manuals/${id}/edit`);
                }}
            />
            <EditManualDialog
                manual={selectedManual}
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
                onSuccess={fetchManuals}
            />
            <DeleteManualDialog
                manual={selectedManual}
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                onSuccess={fetchManuals}
            />
        </div>
    );
};

export default ManualsManagement;
