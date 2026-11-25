import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ArrowLeft, FileText, MessageSquare, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import PDFControls from "@/components/pdf-viewer/PDFControls";
import PDFDocument from "@/components/pdf-viewer/PDFDocument";
import PageThumbnails from "@/components/pdf-viewer/PageThumbnails";
import AIChatPanel from "@/components/pdf-viewer/AIChatPanel";
import PDFSearch from "@/components/pdf-viewer/PDFSearch";
import { CHAT_API_CONFIG } from "@/config/chatApi";
import { useIsMobile } from "@/hooks/use-mobile";
import { hexToHsl, isLightColor, getThemeVariables } from "@/lib/utils";

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

interface PortalManualViewerProps {
  manual: Manual;
  onBack: () => void;
  companyName: string;
  primaryColor?: string | null;
  backgroundColor?: string | null;
}

export function PortalManualViewer({
  manual,
  onBack,
  companyName,
  primaryColor,
  backgroundColor,
}: PortalManualViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const isMobile = useIsMobile();

  // Analytics tracking - use refs to avoid stale closures
  const startTimeRef = useRef<number>(Date.now());
  const pagesViewedRef = useRef<Set<number>>(new Set([1]));
  const hasTrackedRef = useRef(false);
  const numPagesRef = useRef(0);

  // Keep numPagesRef in sync with state
  useEffect(() => {
    numPagesRef.current = numPages;
  }, [numPages]);

  // Reset state when manual changes
  useEffect(() => {
    setCurrentPage(1);
    setScale(1.0);
    setRotation(0);
    setNumPages(0);
    setChatOpen(false);
    setSearchOpen(false);
    startTimeRef.current = Date.now();
    pagesViewedRef.current = new Set([1]);
    hasTrackedRef.current = false;
    numPagesRef.current = 0;
  }, [manual.id]);

  // Track view on unmount or navigation
  const trackView = useCallback(async () => {
    if (hasTrackedRef.current) return;
    hasTrackedRef.current = true;

    const duration = Math.round((Date.now() - startTimeRef.current) / 1000);

    try {
      await fetch(`${CHAT_API_CONFIG.BASE_URL}/analytics/view`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          manual_id: manual.id,
          reading_duration_seconds: duration,
          pages_viewed: pagesViewedRef.current.size,
          total_pages: numPagesRef.current || 1,
          referrer: document.referrer || null,
        }),
      });
    } catch (err) {
      console.error('Failed to track view:', err);
    }
  }, [manual.id]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      trackView();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      trackView();
    };
  }, [trackView]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setCurrentPage(page);
      pagesViewedRef.current.add(page);
    }
  };

  const handlePageLoad = (page: number) => {
    setCurrentPage(page);
    pagesViewedRef.current.add(page);
  };

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleDownload = () => {
    if (manual.pdfUrl) {
      const link = document.createElement('a');
      link.href = manual.pdfUrl;
      link.download = manual.title || 'manual.pdf';
      link.click();
    }
  };

  const handleFullscreen = async () => {
    const root = document.documentElement;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await root.requestFullscreen();
    }
  };

  const handleBack = () => {
    trackView();
    onBack();
  };

  const hasCustomPrimary = !!primaryColor;

  const containerStyle = useMemo(() => {
    return getThemeVariables(primaryColor, backgroundColor) as React.CSSProperties;
  }, [primaryColor, backgroundColor]);

  return (
    <div className="h-screen bg-background flex flex-col" style={containerStyle}>
      <header
        className={hasCustomPrimary ? "bg-primary text-primary-foreground border-b border-primary-foreground/20 shadow-sm flex-shrink-0 z-50" : "border-b border-border bg-card flex-shrink-0 z-50"}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className={`gap-2 ${primaryColor ? 'text-primary-foreground hover:bg-primary-foreground/10' : ''}`}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <div className={`h-4 w-px ${primaryColor ? 'bg-primary-foreground/20' : 'bg-border'}`} />
            <FileText className="h-5 w-5 flex-shrink-0" />
            <span className="font-medium truncate">{manual.title}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm hidden sm:inline" style={hasCustomPrimary ? { opacity: 0.9 } : undefined}>
              <span className={hasCustomPrimary ? "font-medium" : "font-medium text-foreground"}>{companyName}</span>
            </span>
            <Button
              variant={chatOpen ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setChatOpen(!chatOpen)}
              className={hasCustomPrimary && !chatOpen ? "gap-2 bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/20 hover:text-primary-foreground" : "gap-2"}
            >
              {chatOpen ? (
                <>
                  <PanelRightClose className="h-4 w-4" />
                  <span className="hidden sm:inline">Close Chat</span>
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">AI Chat</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="h-10 border-b bg-card/50 flex items-center px-4 overflow-x-auto no-scrollbar shrink-0 z-40">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={handleBack} className="cursor-pointer text-xs">
                Portal
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-xs font-medium max-w-[150px] truncate">{manual.title}</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-xs">Page {currentPage}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <PDFControls
        currentPage={currentPage}
        numPages={numPages}
        scale={scale}
        searchOpen={searchOpen}
        onPageChange={handlePageChange}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onRotate={handleRotate}
        onDownload={handleDownload}
        onFullscreen={handleFullscreen}
        onToggleSearch={() => setSearchOpen(!searchOpen)}
      />

      <PDFSearch
        numPages={numPages}
        onNavigateToPage={handlePageChange}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      <main className="flex-1 flex overflow-hidden relative">
        <ResizablePanelGroup direction="horizontal" key={`viewer-layout-${chatOpen}`} className="flex-1 flex overflow-hidden">
          <ResizablePanel 
            id="pdf-panel"
            order={1}
            defaultSize={chatOpen && !isMobile ? 75 : 100} 
            minSize={30} 
            className="flex relative"
          >
            {numPages > 0 && (
              <PageThumbnails
                url={manual.pdfUrl}
                numPages={numPages}
                currentPage={currentPage}
                onPageSelect={handlePageChange}
              />
            )}

            <PDFDocument
              url={manual.pdfUrl}
              currentPage={currentPage}
              scale={scale}
              rotation={rotation}
              onLoadSuccess={(pages) => setNumPages(pages)}
              onPageChange={handlePageLoad}
            />
          </ResizablePanel>

          {chatOpen && (
            <>
              <ResizableHandle 
                withHandle 
                className={isMobile ? "hidden" : ""} 
              />
              <ResizablePanel 
                id="chat-panel"
                order={2}
                defaultSize={25} minSize={20} maxSize={50}
                className={isMobile ? 'absolute inset-0 z-50 bg-background' : ''}
              >
                <AIChatPanel
                  manualId={manual.id}
                  manualTitle={manual.title}
                  manualDescription={manual.description}
                  isOpen={chatOpen}
                  onClose={() => setChatOpen(false)}
                  onPageChange={handlePageChange}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </main>
    </div>
  );
}