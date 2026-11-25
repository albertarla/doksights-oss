import { useEffect, useState } from 'react';
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { BookOpen, FileText, AlertCircle, MessageSquare, PanelRightClose, ArrowLeft } from 'lucide-react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import PDFControls from '@/components/pdf-viewer/PDFControls';
import PDFDocument from '@/components/pdf-viewer/PDFDocument';
import PageThumbnails from '@/components/pdf-viewer/PageThumbnails';
import AIChatPanel from '@/components/pdf-viewer/AIChatPanel';
import PDFSearch from '@/components/pdf-viewer/PDFSearch';
import { useIsMobile } from '@/hooks/use-mobile';
import { WebManualViewer } from '@/components/portal/WebManualViewer';

interface ManualData {
  id: string;
  title: string;
  description: string | null;
  file_path: string | null;
  manual_type: 'pdf' | 'web';
  company_id: string;
}

const InternalManualViewer = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, companyId } = useAuth();
  const [manual, setManual] = useState<ManualData | null>(null);
  const [companyName, setCompanyName] = useState<string>("DokSights");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // PDF viewer state
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const fetchManual = async () => {
      if (!id || !user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch manual - RLS ensures only company members can see their manuals
        const { data: manualData, error: manualError } = await supabase
          .from('manuals')
          .select('id, title, description, file_path, manual_type, company_id')
          .eq('id', id)
          .single();

        if (manualError || !manualData) {
          setError('Manual not found or you do not have access.');
          setLoading(false);
          return;
        }

        setManual(manualData as ManualData);

        // Fetch company name
        const { data: companyData } = await supabase
          .from('companies')
          .select('name')
          .eq('id', manualData.company_id)
          .single();
        
        if (companyData) {
          setCompanyName(companyData.name);
        }

        // Only get signed URL if it's a PDF manual
        if (manualData.manual_type === 'pdf' && manualData.file_path) {
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from('manuals')
            .createSignedUrl(manualData.file_path, 3600);

          if (signedUrlError || !signedUrlData?.signedUrl) {
            setError('Failed to load the PDF file.');
            setLoading(false);
            return;
          }

          setPdfUrl(signedUrlData.signedUrl);
        }
      } catch (err) {
        console.error('Error fetching manual:', err);
        setError('Failed to load the manual. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchManual();
    }
  }, [id, user, authLoading]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setCurrentPage(page);
    }
  };

  const handlePageLoad = (page: number) => {
    setCurrentPage(page);
  };

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleDownload = () => {
    if (pdfUrl) {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = manual?.title || 'manual.pdf';
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

  // Redirect to auth if not logged in
  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading manual...</p>
        </div>
      </div>
    );
  }

  if (error || !manual) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border">
          <div className="container flex h-16 items-center">
            <Link to="/dashboard" className="flex items-center gap-2 flex-shrink-0 min-w-0">
              <BookOpen className="h-6 w-6 text-primary flex-shrink-0" />
              <span className="font-display text-xl font-medium truncate">DokSights</span>
            </Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="flex flex-col items-center py-12">
              <div className="rounded-full bg-destructive/10 p-4 mb-4">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="font-display text-xl mb-2 text-center">
                Manual Not Found
              </CardTitle>
              <CardDescription className="text-center mb-6">
                {error || "The manual you're looking for could not be found."}
              </CardDescription>
              <Button asChild>
                <Link to="/dashboard">Back to Dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // If it's a web manual, render the WebManualViewer
  if (manual.manual_type === 'web') {
    return (
      <WebManualViewer 
        manual={{
          id: manual.id,
          title: manual.title,
          description: manual.description,
          manualType: 'web',
          pageCount: null,
          folderId: null,
          displayOrder: 0,
          createdAt: new Date().toISOString(),
        }} 
        onBack={() => navigate('/dashboard/manuals')} 
        companyName={companyName}
      />
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card flex-shrink-0 z-50">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard/manuals" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back</span>
              </Link>
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="font-medium truncate">{manual.title}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant={chatOpen ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChatOpen(!chatOpen)}
              className="gap-2"
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

      {pdfUrl && (
        <>
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
        </>
      )}

      <main className="flex-1 flex overflow-hidden relative">
        <ResizablePanelGroup direction="horizontal" key={`internal-viewer-layout-${chatOpen}`} className="flex-1 flex overflow-hidden">
          <ResizablePanel 
            id="pdf-panel"
            order={1}
            defaultSize={chatOpen && !isMobile ? 75 : 100} 
            minSize={30} 
            className="flex relative"
          >
            {pdfUrl && numPages > 0 && (
              <PageThumbnails
                url={pdfUrl}
                numPages={numPages}
                currentPage={currentPage}
                onPageSelect={handlePageChange}
              />
            )}

            {pdfUrl ? (
              <PDFDocument
                url={pdfUrl}
                currentPage={currentPage}
                scale={scale}
                rotation={rotation}
                onLoadSuccess={(pages) => setNumPages(pages)}
                onPageChange={handlePageLoad}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <Card className="max-w-md">
                  <CardContent className="flex flex-col items-center py-12">
                    <div className="rounded-full bg-primary/10 p-4 mb-4">
                      <FileText className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="font-display text-xl mb-2">
                      Unable to Load PDF
                    </CardTitle>
                    <CardDescription className="text-center">
                      There was an issue loading the PDF document.
                    </CardDescription>
                  </CardContent>
                </Card>
              </div>
            )}
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
};

export default InternalManualViewer;
