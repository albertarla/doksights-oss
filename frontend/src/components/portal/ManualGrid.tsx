import { FileText, BookOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Manual {
  id: string;
  title: string;
  description: string | null;
  pageCount: number | null;
  folderId: string | null;
  displayOrder: number;
  createdAt: string;
  pdfUrl?: string | null;
  manualType?: 'pdf' | 'web';
}

interface ManualGridProps {
  manuals: Manual[];
  onSelectManual: (manual: Manual) => void;
}

export function ManualGrid({ manuals, onSelectManual }: ManualGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {manuals.map((manual) => (
        <Card
          key={manual.id}
          className="cursor-pointer hover:shadow-md hover:border-primary/50 transition-all group"
          onClick={() => onSelectManual(manual)}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                {manual.manualType === 'web' ? (
                  <BookOpen className="h-5 w-5 text-primary" />
                ) : (
                  <FileText className="h-5 w-5 text-primary" />
                )}
              </div>
              {manual.pageCount !== null && manual.pageCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {manual.pageCount} {manual.manualType === 'web' ? 'sections' : 'pages'}
                </Badge>
              )}
            </div>
            <CardTitle className="text-base line-clamp-2 group-hover:text-primary transition-colors">
              {manual.title}
            </CardTitle>
            {manual.description && (
              <CardDescription className="line-clamp-2">
                {manual.description}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              <span>Click to view</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
