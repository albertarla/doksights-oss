import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ArrowLeft, BookOpen, MessageSquare, PanelRightClose, Link2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import AIChatPanel from "@/components/pdf-viewer/AIChatPanel";
import { CHAT_API_CONFIG } from "@/config/chatApi";
import { useIsMobile } from "@/hooks/use-mobile";
import { hexToHsl, isLightColor, getThemeVariables } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownImage } from "./MarkdownImage";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface Manual {
  id: string;
  title: string;
  description: string | null;
  manualType?: 'pdf' | 'web';
  pageCount: number | null;
  folderId: string | null;
  displayOrder: number;
  createdAt: string;
  pdfUrl?: string | null;
}

interface Section {
  id: string;
  title: string;
  content: string;
  display_order: number;
}

interface WebManualViewerProps {
  manual: Manual;
  onBack: () => void;
  companyName: string;
  primaryColor?: string | null;
  backgroundColor?: string | null;
}

export function WebManualViewer({
  manual,
  onBack,
  companyName,
  primaryColor,
  backgroundColor,
}: WebManualViewerProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const isMobile = useIsMobile();
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  // Analytics tracking
  const startTimeRef = useRef<number>(Date.now());
  const hasTrackedRef = useRef(false);

  // Reset state when manual changes
  useEffect(() => {
    setChatOpen(false);
    startTimeRef.current = Date.now();
    hasTrackedRef.current = false;
  }, [manual.id]);

  useEffect(() => {
    const fetchSections = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('manual_sections')
        .select('id, title, content, display_order')
        .eq('manual_id', manual.id)
        .order('display_order');
        
      if (error) {
        console.error("Failed to load sections:", error);
      } else if (data) {
        setSections(data);
        if (data.length > 0) {
          setActiveSectionId(data[0].id);
        }
      }
      setLoading(false);
    };
    fetchSections();
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
          pages_viewed: sections.length || 1, // Consider all sections viewed for web manual
          total_pages: sections.length || 1,
          referrer: document.referrer || null,
        }),
      });
    } catch (err) {
      console.error('Failed to track view:', err);
    }
  }, [manual.id, sections.length]);

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

  const handleBack = () => {
    trackView();
    onBack();
  };

  const activeSection = sections.find(s => s.id === activeSectionId);

  // Internal link interception for #section-{id} hrefs
  const CustomLink = useCallback(
    ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      if (href?.startsWith('#section-')) {
        const targetId = href.slice(1); // e.g. 'section-abc123'
        const matched = sections.find(s => `section-${s.id}` === targetId);
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              if (matched) {
                setActiveSectionId(matched.id);
                // Scroll content area to top
                contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="cursor-pointer"
            {...rest}
          >
            {children}
          </a>
        );
      }
      // External link: open in new tab
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
          {children}
        </a>
      );
    },
    [sections]
  );

  const handleCopySectionLink = (sectionId: string) => {
    navigator.clipboard.writeText(`#section-${sectionId}`);
    setCopiedSectionId(sectionId);
    setTimeout(() => setCopiedSectionId(null), 2000);
  };

  // Apply custom theme colors if provided
  const customThemeStyles = useMemo(() => {
    return getThemeVariables(primaryColor, backgroundColor) as React.CSSProperties;
  }, [primaryColor, backgroundColor]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden" style={customThemeStyles}>
      {/* Header */}
      <header className={`h-14 border-b flex items-center justify-between px-4 z-50 shrink-0 ${
        primaryColor 
          ? "bg-primary text-primary-foreground border-primary-foreground/20 shadow-sm" 
          : "bg-card/80 backdrop-blur-sm border-border"
      }`}>
        <div className="flex items-center gap-4 min-w-0">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack} 
            className={`shrink-0 ${primaryColor ? 'hover:bg-primary-foreground/10 text-primary-foreground' : ''}`}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className={`h-5 w-5 shrink-0 ${primaryColor ? 'text-primary-foreground' : 'text-primary'}`} />
            <h1 className="font-display font-medium text-lg truncate">
              {manual.title}
            </h1>
            <span className={`hidden sm:inline-block ml-2 text-sm shrink-0 ${primaryColor ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              {companyName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={chatOpen ? "secondary" : "outline"}
            size="sm"
            onClick={() => setChatOpen(!chatOpen)}
            className={`shrink-0 ${primaryColor && !chatOpen ? "bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/20 hover:text-primary-foreground" : ""}`}
          >
            {chatOpen ? (
              <PanelRightClose className="h-4 w-4 mr-2 hidden sm:inline-block" />
            ) : (
              <MessageSquare className="h-4 w-4 mr-2 hidden sm:inline-block" />
            )}
            <span className="hidden sm:inline-block">AI Chat</span>
            <MessageSquare className="h-4 w-4 sm:hidden" />
          </Button>
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
            {activeSection && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-xs max-w-[200px] truncate">{activeSection.title}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        <ResizablePanelGroup direction="horizontal" key={`layout-${chatOpen}`}>
          <ResizablePanel 
            id="content-panel"
            order={1}
            defaultSize={chatOpen && !isMobile ? 70 : 100} 
            minSize={30}
            className="flex flex-col"
          >
            {/* Sidebar + Content layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Table of Contents Sidebar */}
                <div className="w-64 border-r border-border bg-muted/10 hidden md:flex flex-col">
                    <div className="p-4 border-b border-border font-medium text-sm text-muted-foreground">
                        Contents
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-2 space-y-1">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                            ) : sections.length === 0 ? (
                                <div className="p-4 text-sm text-muted-foreground">No content available.</div>
                            ) : (
                                sections.map((section) => (
                                    <div key={section.id} className="group/item flex items-center gap-1">
                                        <button
                                            onClick={() => setActiveSectionId(section.id)}
                                            className={`flex-1 text-left px-3 py-2 text-sm rounded-md transition-colors ${
                                                activeSectionId === section.id 
                                                    ? 'bg-primary/10 text-primary font-medium' 
                                                    : 'text-foreground hover:bg-muted'
                                            }`}
                                        >
                                            <div className="truncate">{section.title}</div>
                                        </button>
                                        <button
                                            title="Copy section link"
                                            onClick={() => handleCopySectionLink(section.id)}
                                            className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover/item:opacity-100 hover:bg-muted transition-opacity shrink-0"
                                            data-testid={`copy-section-link-${section.id}`}
                                        >
                                            {copiedSectionId === section.id ? (
                                                <Check className="h-3 w-3 text-green-500" />
                                            ) : (
                                                <Link2 className="h-3 w-3 text-muted-foreground" />
                                            )}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </div>

                {/* Main Content */}
                <ScrollArea className="flex-1 bg-background relative">
                    <div ref={contentScrollRef} className="max-w-4xl mx-auto p-6 sm:p-12">
                        {loading ? (
                            <div className="space-y-4">
                                <Skeleton className="h-10 w-2/3" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-5/6" />
                            </div>
                        ) : activeSection ? (
                            <article className="prose prose-zinc dark:prose-invert prose-headings:font-display prose-headings:font-bold prose-h1:text-4xl prose-h2:text-3xl prose-h3:text-2xl prose-h4:text-xl prose-h5:text-lg prose-h6:text-base prose-a:text-primary max-w-none prose-p:leading-relaxed">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkBreaks]}
                                  components={{ 
                                    a: CustomLink,
                                    img: MarkdownImage
                                  }}
                                  urlTransform={(value) => value}
                                >
                                    {activeSection.content}
                                </ReactMarkdown>
                            </article>
                        ) : (
                            <div className="text-center py-20 text-muted-foreground">
                                Select a section to view content.
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
          </ResizablePanel>

          {/* Collapsible Chat Panel */}
          {chatOpen && (
            <>
              <ResizableHandle withHandle className={isMobile ? "hidden" : ""} />
              <ResizablePanel 
                id="chat-panel"
                order={2}
                defaultSize={30} 
                minSize={25} 
                maxSize={50}
                className={isMobile ? "absolute inset-0 z-20 bg-background" : ""}
              >
                <AIChatPanel
                  manualId={manual.id}
                  manualTitle={manual.title}
                  manualDescription={manual.description}
                  isOpen={chatOpen}
                  onClose={() => setChatOpen(false)}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
