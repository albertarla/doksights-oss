import { useState } from "react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { ManualGrid } from "./ManualGrid";
import { cn } from "@/lib/utils";

interface Manual {
  id: string;
  title: string;
  description: string | null;
  pageCount: number | null;
  folderId: string | null;
  displayOrder: number;
  createdAt: string;
  pdfUrl: string;
}

interface FolderProps {
  folder: {
    id: string;
    name: string;
    description: string | null;
    displayOrder: number;
    manuals: Manual[];
  };
  onSelectManual: (manual: Manual) => void;
}

export function FolderGrid({ folder, onSelectManual }: FolderProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (folder.manuals.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-3 w-full text-left group"
      >
        <div className="p-2 rounded-lg bg-secondary/50 group-hover:bg-secondary transition-colors">
          <Folder className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
            {folder.name}
          </h2>
          {folder.description && (
            <p className="text-sm text-muted-foreground">{folder.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {folder.manuals.length} {folder.manuals.length === 1 ? "manual" : "manuals"}
          </span>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="pl-12">
          <ManualGrid manuals={folder.manuals} onSelectManual={onSelectManual} />
        </div>
      </div>
    </div>
  );
}
