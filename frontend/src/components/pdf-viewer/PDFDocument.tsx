import { useState, useCallback, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up the worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface VirtualPageProps {
  index: number;
  scale: number;
  rotation: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

const VirtualPage = ({ index, scale, rotation, currentPage, onPageChange }: VirtualPageProps) => {
  const [isVisible, setIsVisible] = useState(false);
  // Default estimate for A4 paper at scale 1.0 (approx 842px at 72dpi, varies by PDF)
  // When scale changes, we keep this relative to the scale
  const estimatedHeight = 842 * scale;
  const ref = useRef<HTMLDivElement>(null);
  const [loadedHeight, setLoadedHeight] = useState<number | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        rootMargin: '100% 0px 100% 0px', // preload 1 screen above and below
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      id={`page-${index + 1}`}
      style={{ minHeight: loadedHeight ? loadedHeight * scale : estimatedHeight }}
      className={`shadow-lg rounded-lg overflow-hidden transition-all flex justify-center bg-white ${
        currentPage === index + 1 ? 'ring-2 ring-primary' : ''
      }`}
      onClick={() => onPageChange(index + 1)}
    >
      {(isVisible || currentPage === index + 1) ? (
        <Page
          pageNumber={index + 1}
          scale={scale}
          rotate={rotation}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          className="bg-white"
          onLoadSuccess={(page: any) => {
            // Only set if we can get the viewport height
            if (page.getViewport) {
              setLoadedHeight(page.getViewport({ scale: 1 }).height);
            }
          }}
        />
      ) : (
        <div className="flex items-center justify-center text-muted-foreground w-full h-full min-h-[500px]">
          <span>Loading page {index + 1}...</span>
        </div>
      )}
    </div>
  );
};

interface PDFDocumentProps {
  url: string;
  currentPage: number;
  scale: number;
  rotation: number;
  onLoadSuccess: (numPages: number) => void;
  onPageChange: (page: number) => void;
}

const PDFDocument = ({
  url,
  currentPage,
  scale,
  rotation,
  onLoadSuccess,
  onPageChange,
}: PDFDocumentProps) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const isInternalChange = useRef(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Hook to handle scroll to page
  useEffect(() => {
    if (!isInternalChange.current && currentPage > 0) {
      const pageElement = document.getElementById(`page-${currentPage}`);
      if (pageElement) {
        // Use smooth scroll for jumping to pages
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    // Always reset the internal change flag
    isInternalChange.current = false;
  }, [currentPage]);

  // Set up intersection observer for scroll detection
  useEffect(() => {
    if (numPages === 0) return;

    const options = {
      root: null, // use viewport
      rootMargin: '-20% 0px -70% 0px', // focused center area
      threshold: 0,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const pageNum = parseInt(entry.target.id.replace('page-', ''));
          if (pageNum && pageNum !== currentPage) {
            isInternalChange.current = true;
            onPageChange(pageNum);
          }
        }
      });
    }, options);

    // Observe all page containers
    const pageElements = document.querySelectorAll('[id^="page-"]');
    pageElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [numPages, onPageChange, currentPage]);

  const handleLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setLoading(false);
      onLoadSuccess(numPages);
    },
    [onLoadSuccess]
  );

  const handleLoadError = (error: Error) => {
    console.error('Error loading PDF:', error);
    setLoading(false);
  };

  return (
    <ScrollArea className="flex-1 bg-muted/30" ref={scrollAreaRef}>
      <div className="min-h-full flex flex-col items-center py-8 px-4">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}
        
        <Document
          file={url}
          onLoadSuccess={handleLoadSuccess}
          onLoadError={handleLoadError}
          onItemClick={({ pageNumber }) => {
            // When an internal link is clicked, we want to jump
            if (pageNumber) {
              isInternalChange.current = false;
              onPageChange(typeof pageNumber === 'string' ? parseInt(pageNumber) : pageNumber);
            }
          }}
          loading={null}
          className="flex flex-col items-center gap-8 w-full"
        >
          {Array.from(new Array(numPages), (_, index) => (
            <VirtualPage
              key={`page_${index + 1}`}
              index={index}
              scale={scale}
              rotation={rotation}
              currentPage={currentPage}
              onPageChange={onPageChange}
            />
          ))}
        </Document>
      </div>
    </ScrollArea>
  );
};

export default PDFDocument;
