import { Document, Page, pdfjs } from 'react-pdf';
import { ScrollArea } from '@/components/ui/scroll-area';

// Set up the worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PageThumbnailsProps {
  url: string;
  numPages: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
}

const PageThumbnails = ({
  url,
  numPages,
  currentPage,
  onPageSelect,
}: PageThumbnailsProps) => {
  if (numPages === 0) return null;

  return (
    <div className="w-32 lg:w-40 border-r border-border bg-card hidden md:block">
      <div className="p-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">
          Pages
        </span>
      </div>
      <ScrollArea className="h-[calc(100%-2.5rem)]">
        <div className="p-2 space-y-2">
          <Document file={url} loading={null}>
            {Array.from(new Array(numPages), (_, index) => (
              <button
                key={`thumb_${index + 1}`}
                onClick={() => onPageSelect(index + 1)}
                className={`w-full rounded-md overflow-hidden transition-all border-2 ${
                  currentPage === index + 1
                    ? 'border-primary shadow-md'
                    : 'border-transparent hover:border-muted-foreground/30'
                }`}
              >
                <Page
                  pageNumber={index + 1}
                  width={100}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="w-full"
                />
                <div className="py-1 text-xs text-center bg-muted/50">
                  {index + 1}
                </div>
              </button>
            ))}
          </Document>
        </div>
      </ScrollArea>
    </div>
  );
};

export default PageThumbnails;
