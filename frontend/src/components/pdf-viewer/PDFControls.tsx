import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Maximize2,
  Search,
} from 'lucide-react';

interface PDFControlsProps {
  currentPage: number;
  numPages: number;
  scale: number;
  searchOpen: boolean;
  onPageChange: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotate: () => void;
  onDownload: () => void;
  onFullscreen: () => void;
  onToggleSearch: () => void;
}

const PDFControls = ({
  currentPage,
  numPages,
  scale,
  searchOpen,
  onPageChange,
  onZoomIn,
  onZoomOut,
  onRotate,
  onDownload,
  onFullscreen,
  onToggleSearch,
}: PDFControlsProps) => {
  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= numPages) {
      onPageChange(value);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-center sm:justify-between gap-y-2 gap-x-4 p-2 sm:p-3 bg-card border-b border-border">
      {/* Page Navigation */}
      <div className="flex flex-wrap flex-1 sm:flex-none justify-center items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <div className="flex items-center justify-center gap-2">
          <Input
            type="number"
            value={currentPage}
            onChange={handlePageInput}
            className="w-16 text-center"
            min={1}
            max={numPages}
            aria-label="Current page"
          />
          <span className="text-sm text-muted-foreground">
            of {numPages}
          </span>
        </div>
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= numPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Zoom Controls */}
      <div className="flex flex-wrap flex-1 sm:flex-none justify-center items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onZoomOut}
          disabled={scale <= 0.5}
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        
        <span className="text-sm text-muted-foreground min-w-[4rem] text-center">
          {Math.round(scale * 100)}%
        </span>
        
        <Button
          variant="outline"
          size="icon"
          onClick={onZoomIn}
          disabled={scale >= 3}
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Additional Controls */}
      <div className="flex flex-wrap flex-1 sm:flex-none justify-center items-center gap-2">
        <Button
          variant={searchOpen ? 'default' : 'outline'}
          size="icon"
          onClick={onToggleSearch}
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={onRotate}
          aria-label="Rotate"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={onFullscreen}
          aria-label="Fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={onDownload}
          aria-label="Download"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default PDFControls;
