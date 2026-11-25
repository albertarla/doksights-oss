import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  FileText,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Globe,
  Folder,
  RefreshCw,
  BookOpen,
} from 'lucide-react';

interface Manual {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_size: number;
  created_at: string;
  is_public?: boolean;
  folder_id?: string | null;
  rag_status?: 'pending' | 'processing' | 'completed' | 'failed';
  rag_error?: string | null;
  manual_type?: 'pdf' | 'web';
}

interface FolderOption {
  id: string;
  name: string;
}

interface ManualCardProps {
  manual: Manual;
  folders?: FolderOption[];
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublic?: (manualId: string, isPublic: boolean) => void;
  onFolderChange?: (manualId: string, folderId: string | null) => void;
  onRetryProcess?: (manualId: string) => void;
}

export function ManualCard({
  manual,
  folders = [],
  onEdit,
  onDelete,
  onTogglePublic,
  onFolderChange,
  onRetryProcess,
}: ManualCardProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getStatusBadge = () => {
    if (!manual.rag_status) return null;

    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      processing: "secondary",
      completed: "default",
      failed: "destructive",
    };

    const statusMap: Record<string, string> = {
      pending: "AI Context: Pending",
      processing: "AI Context: Indexing...",
      completed: "AI Context: Ready",
      failed: "AI Context: Failed",
    };

    const tooltipMap: Record<string, string> = {
      pending: "PDF is viewable, but AI chat doesn't have context yet. Processing will start shortly.",
      processing: "AI is analyzing the PDF content to enable context-aware chat responses.",
      completed: "AI chat is ready with full context from this manual.",
      failed: manual.rag_error || "Failed to process PDF for AI context. Chat will work without manual context.",
    };

    return (
      <span title={tooltipMap[manual.rag_status] || ""} className="cursor-help">
        <Badge
          variant={variants[manual.rag_status] || "outline"}
          className="text-xs"
        >
          {statusMap[manual.rag_status] || manual.rag_status}
        </Badge>
      </span>
    );
  };

  return (
    <Card className="group transition-all hover:shadow-md hover:border-primary/20">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-3 flex-shrink-0">
            {manual.manual_type === 'web' ? (
              <BookOpen className="h-6 w-6 text-primary" />
            ) : (
              <FileText className="h-6 w-6 text-primary" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium truncate">{manual.title}</h3>
                  {getStatusBadge()}
                </div>
                {manual.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {manual.description}
                  </p>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover">
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Details
                  </DropdownMenuItem>
                  {manual.manual_type === 'web' && (
                    <DropdownMenuItem asChild>
                      <Link to={`/manuals/${manual.id}/edit`}>
                        <BookOpen className="mr-2 h-4 w-4" />
                        Edit Content
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to={`/manual/${manual.id}`}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Manual
                    </Link>
                  </DropdownMenuItem>
                  {manual.rag_status !== 'processing' && onRetryProcess && (
                    <DropdownMenuItem onClick={() => onRetryProcess(manual.id)}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {manual.rag_status === 'completed' ? 'Refresh AI Context' : 'Process for AI'}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-muted-foreground">
              {manual.manual_type === 'web' ? (
                <span>Web Manual</span>
              ) : (
                <span>{manual.file_size ? formatFileSize(manual.file_size) : 'Unknown size'}</span>
              )}
              <span>•</span>
              <span>{format(new Date(manual.created_at), 'MMM d, yyyy')}</span>
            </div>

            {/* Folder assignment and Public toggle */}
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {/* Folder selector */}
              {folders.length > 0 && (
                <div className="flex items-center gap-2">
                  <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                  <Select
                    value={manual.folder_id || "none"}
                    onValueChange={(value) =>
                      onFolderChange?.(manual.id, value === "none" ? null : value)
                    }
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue placeholder="Select folder" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Uncategorized</SelectItem>
                      {folders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Public toggle */}
              <div className="flex items-center gap-2">
                <Switch
                  id={`public-${manual.id}`}
                  checked={manual.is_public || false}
                  onCheckedChange={(checked) => onTogglePublic?.(manual.id, checked)}
                />
                <label
                  htmlFor={`public-${manual.id}`}
                  className="text-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {manual.is_public ? (
                    <Badge variant="default" className="text-xs">Public</Badge>
                  ) : (
                    <span className="text-muted-foreground">Private</span>
                  )}
                </label>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}