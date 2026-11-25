import { Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LABEL_COLORS } from './ClassificationDonutChart';

export interface ChatTheme {
  id: string;
  label: string;
  title: string;
  session_count: number;
}

interface Props {
  themes: ChatTheme[];
  isLoading: boolean;
  currentPage: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
}

/** Return a short badge variant colour class based on the label. */
const labelBadgeStyle = (label: string): React.CSSProperties => ({
  backgroundColor: LABEL_COLORS[label] ?? 'hsl(220,10%,55%)',
  color: '#fff',
  fontSize: '10px',
  padding: '2px 6px',
  borderRadius: '4px',
  whiteSpace: 'nowrap',
});

export const TopThemesTable = ({ 
  themes, 
  isLoading, 
  currentPage = 0, 
  hasMore = false, 
  onPageChange = () => {} 
}: Props) => {
  if (isLoading) {
    return (
      <div className="h-48 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (themes.length === 0) {
    return (
      <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
        <Layers className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No themes identified yet. Classification groups recurring topics automatically.</p>
      </div>
    );
  }

  // Ensure sorting by session_count DESC
  const sorted = [...themes].sort((a, b) => b.session_count - a.session_count);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium w-8">#</th>
              <th className="pb-2 pr-4 font-medium">Theme</th>
              <th className="pb-2 pr-4 font-medium">Category</th>
              <th className="pb-2 font-medium text-right">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((theme, idx) => (
              <tr
                key={theme.id}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors"
              >
                <td className="py-3 pr-4 text-muted-foreground font-mono">
                  {idx + 1 + currentPage * 5}
                </td>
                <td className="py-3 pr-4 font-medium max-w-xs truncate" title={theme.title}>
                  {theme.title}
                </td>
                <td className="py-3 pr-4">
                  <span style={labelBadgeStyle(theme.label)}>{theme.label}</span>
                </td>
                <td className="py-3 text-right font-semibold tabular-nums">
                  {theme.session_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPage + 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasMore}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
};
