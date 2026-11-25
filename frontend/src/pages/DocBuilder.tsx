import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ArrowLeft, Save, Plus, GripVertical, Trash2, BookOpen, RefreshCw, Eye, ImageIcon, FileText, Link2 } from 'lucide-react';
import { ImageLibrary } from '@/components/manuals/ImageLibrary';
import { toast } from 'sonner';
import { manualService } from '@/services/manualService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { MarkdownImage } from '@/components/portal/MarkdownImage';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Section {
  id: string;
  title: string;
  content: string;
  display_order: number;
  isNew?: boolean;
  hasCustomTitle?: boolean;
}

interface SortableSectionItemProps {
  section: Section;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function SortableSectionItem({ section, isActive, onSelect, onDelete }: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 p-2 rounded-md border ${isActive ? 'bg-primary/10 border-primary/30' : 'bg-card border-transparent hover:border-border'
        }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground p-1 opacity-50 group-hover:opacity-100">
        <GripVertical className="h-4 w-4" />
      </div>
      <button
        type="button"
        className="flex-1 text-left truncate text-sm font-medium"
        onClick={onSelect}
      >
        {section.title || 'Untitled Section'}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

export default function DocBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { canEditManuals } = usePermissions();

  const [manual, setManual] = useState<any>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [draftData, setDraftData] = useState<Section[] | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'sections' | 'images'>('sections');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!user || !canEditManuals) {
      navigate('/dashboard');
      return;
    }

    const fetchManualAndSections = async () => {
      setLoading(true);
      try {
        // Fetch Manual
        const { data: manualData, error: manualError } = await supabase
          .from('manuals')
          .select('*')
          .eq('id', id)
          .single();

        if (manualError || !manualData) {
          toast.error("Manual not found.");
          navigate('/dashboard/manuals');
          return;
        }

        if (manualData.manual_type !== 'web') {
          toast.error("This is not a Web Manual.");
          navigate('/dashboard/manuals');
          return;
        }

        setManual(manualData);

        // Fetch Sections
        const { data: sectionsData, error: sectionsError } = await supabase
          .from('manual_sections')
          .select('*')
          .eq('manual_id', id)
          .order('display_order');

        if (sectionsError) {
          console.error("Error fetching sections:", sectionsError);
          toast.error("Failed to load sections.");
        } else {
          setSections(sectionsData || []);
          if (sectionsData && sectionsData.length > 0) {
            setActiveSectionId(sectionsData[0].id);
          }
        }
      } catch (err) {
        console.error(err);
        toast.error("An error occurred while loading the manual.");
      } finally {
        setLoading(false);
      }
    };

    fetchManualAndSections();
  }, [id, user, canEditManuals, navigate]);

  // Check for local draft on mount
  useEffect(() => {
    if (!id || loading) return;

    const savedDraft = localStorage.getItem(`web_manual_draft_${id}`);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDraftData(parsed);
          setShowDraftPrompt(true);
        }
      } catch (e) {
        console.error("Failed to parse draft", e);
        localStorage.removeItem(`web_manual_draft_${id}`);
      }
    }
  }, [id, loading]);

  // Auto-save draft to localStorage
  useEffect(() => {
    if (!id || !hasUnsavedChanges || sections.length === 0) return;

    const timer = setTimeout(() => {
      localStorage.setItem(`web_manual_draft_${id}`, JSON.stringify(sections));
    }, 2000);

    return () => clearTimeout(timer);
  }, [id, sections, hasUnsavedChanges]);

  const handleRestoreDraft = () => {
    if (draftData) {
      setSections(draftData);
      setHasUnsavedChanges(true);
      if (draftData.length > 0) {
        setActiveSectionId(draftData[0].id);
      }
      toast.success("Draft restored");
    }
    setShowDraftPrompt(false);
    setDraftData(null);
  };

  const handleDiscardDraft = () => {
    if (id) {
      localStorage.removeItem(`web_manual_draft_${id}`);
    }
    setShowDraftPrompt(false);
    setDraftData(null);
    toast.info("Draft discarded");
  };

  // Prompt before leaving if unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setSections((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        // Update display_order
        const updated = newItems.map((item, index) => ({
          ...item,
          display_order: index,
        }));
        setHasUnsavedChanges(true);
        return updated;
      });
    }
  };

  const handleAddSection = () => {
    const newSection: Section = {
      id: crypto.randomUUID(),
      title: 'New Section',
      content: '# New Section\n\nWrite your content here...',
      display_order: sections.length,
      isNew: true,
      hasCustomTitle: false,
    };
    setSections([...sections, newSection]);
    setActiveSectionId(newSection.id);
    setHasUnsavedChanges(true);
  };

  const handleDeleteSection = (sectionId: string) => {
    if (confirm('Are you sure you want to delete this section?')) {
      const newSections = sections.filter((s) => s.id !== sectionId);
      // Re-order remaining
      const updated = newSections.map((item, index) => ({
        ...item,
        display_order: index,
      }));
      setSections(updated);
      setHasUnsavedChanges(true);
      if (activeSectionId === sectionId) {
        setActiveSectionId(updated.length > 0 ? updated[0].id : null);
      }
    }
  };

  const handleSectionChange = (field: 'title' | 'content', value: string) => {
    if (!activeSectionId) return;
    setSections((prev) =>
      prev.map((s) => {
        if (s.id === activeSectionId) {
          const updated = { ...s, [field]: value };

          if (field === 'title') {
            updated.hasCustomTitle = true;
          }

          // Auto-extract title from markdown if not manually set
          if (field === 'content' && !updated.hasCustomTitle) {
            const match = value.match(/^#\s+(.+)$/m);
            if (match && match[1]) {
              updated.title = match[1].trim();
            }
          }

          return updated;
        }
        return s;
      })
    );
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      // 1. Delete all existing sections for this manual (simple approach since we control all of them)
      // Wait, deleting all and inserting might change IDs which could break deep links if we had them.
      // Better approach: upsert existing, insert new, delete removed.

      const currentIds = sections.map(s => s.id);

      // Delete removed sections
      await supabase
        .from('manual_sections')
        .delete()
        .eq('manual_id', id)
        .not('id', 'in', `(${currentIds.join(',')})`); // Might be empty if currentIds is empty

      if (sections.length > 0) {
        // Upsert all sections
        const { error } = await supabase
          .from('manual_sections')
          .upsert(
            sections.map(s => ({
              id: s.id,
              manual_id: id,
              title: s.title,
              content: s.content,
              display_order: s.display_order,
            }))
          );

        if (error) throw error;
      }

      setSections(sections.map(s => ({ ...s, isNew: false })));
      setHasUnsavedChanges(false);

      // Clear draft on successful save
      if (id) {
        localStorage.removeItem(`web_manual_draft_${id}`);
      }

      toast.success("Saved successfully");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleReprocess = async () => {
    if (hasUnsavedChanges) {
      toast.error("Please save your changes first.");
      return;
    }
    setIsProcessing(true);
    try {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("No access token available");

      setManual((prev: any) => ({ ...prev, rag_status: 'processing' }));
      await manualService.processManual(id!, accessToken);
      toast.success("AI indexing started. This will take a moment.");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to start AI indexing.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInsertImage = useCallback((url: string, fileName: string) => {
    if (!activeSectionId) {
      toast.error('Select a section first to insert an image.');
      return;
    }
    const markdown = `![${fileName}](${url})`;
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? 0;
      const end = textarea.selectionEnd ?? 0;
      const current = sections.find(s => s.id === activeSectionId)?.content ?? '';
      const newContent = current.slice(0, start) + markdown + current.slice(end);
      handleSectionChange('content', newContent);
      // Restore cursor after inserted text
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = start + markdown.length;
        textarea.selectionEnd = start + markdown.length;
      }, 50);
    } else {
      // Fallback: append to end
      const current = sections.find(s => s.id === activeSectionId)?.content ?? '';
      handleSectionChange('content', current + '\n' + markdown);
    }
    toast.success('Image inserted into section.');
  }, [activeSectionId, sections, handleSectionChange]);

  const handleCopySectionLink = useCallback((sectionId: string) => {
    navigator.clipboard.writeText(`#section-${sectionId}`);
    toast.success('Section link copied! Use it as [Link Text](#section-ID) in any section.');
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const activeSection = sections.find((s) => s.id === activeSectionId);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shrink-0">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to="/dashboard/manuals" className="flex items-center gap-2 text-muted-foreground hover:text-foreground shrink-0">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm hidden sm:inline">Back to Documentation</span>
            </Link>
            <div className="h-4 w-px bg-border shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="h-5 w-5 text-primary shrink-0" />
              <span className="font-display text-lg font-medium truncate">
                {manual?.title}
              </span>
              {hasUnsavedChanges && (
                <span className="text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full ml-2 shrink-0">
                  Unsaved changes
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleReprocess}
              disabled={isProcessing || hasUnsavedChanges}
              title="Refresh AI context with the latest saved content"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isProcessing ? 'animate-spin' : ''}`} />
              Publish to AI
            </Button>
            <Button asChild variant="outline">
              <Link to={`/manual/${id}`}>
                <Eye className="h-4 w-4 mr-2" />
                View Manual
              </Link>
            </Button>
            <Button onClick={handleSave} disabled={saving || !hasUnsavedChanges}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      </header>

      {/* Draft Restore Prompt */}
      {showDraftPrompt && (
        <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2 text-sm text-primary font-medium">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            We found an unsaved draft from a previous session.
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleDiscardDraft}>
              Discard
            </Button>
            <Button size="sm" onClick={handleRestoreDraft}>
              Restore Draft
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        {/* Sidebar */}
        <ResizablePanel
          defaultSize={20}
          minSize={15}
          maxSize={40}
          className="flex flex-col bg-muted/20 border-r border-border"
        >
          {/* Tab switcher */}
          <div className="flex border-b border-border shrink-0">
            <button
              onClick={() => setSidebarTab('sections')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${sidebarTab === 'sections'
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
              data-testid="sidebar-sections-tab"
            >
              <FileText className="h-3.5 w-3.5" />
              Sections
            </button>
            <button
              onClick={() => setSidebarTab('images')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${sidebarTab === 'images'
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
              data-testid="sidebar-images-tab"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Images
            </button>
          </div>

          {sidebarTab === 'sections' ? (
            <>
              <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Sections</span>
                <Button variant="ghost" size="icon" onClick={handleAddSection} className="h-7 w-7" title="Add Section">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2">
                  {sections.length === 0 ? (
                    <div className="text-center p-4 text-sm text-muted-foreground border border-dashed rounded-md">
                      No sections yet. Click + to add one.
                    </div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                        {sections.map((section) => (
                          <div key={section.id} className="group/row flex items-center gap-1">
                            <div className="flex-1 min-w-0">
                              <SortableSectionItem
                                section={section}
                                isActive={section.id === activeSectionId}
                                onSelect={() => setActiveSectionId(section.id)}
                                onDelete={() => handleDeleteSection(section.id)}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 opacity-0 group-hover/row:opacity-100 text-muted-foreground"
                              title="Copy section link"
                              onClick={() => handleCopySectionLink(section.id)}
                              data-testid={`copy-section-link-${section.id}`}
                            >
                              <Link2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </ScrollArea>
            </>
          ) : (
            manual?.id ? (
              <ImageLibrary manualId={manual.id} onInsert={handleInsertImage} />
            ) : null
          )}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Editor Area */}
        <ResizablePanel defaultSize={80} className="bg-background">
          {activeSection ? (
            <ResizablePanelGroup direction="horizontal" className="h-full">
              {/* Editor Pane */}
              <ResizablePanel defaultSize={50} minSize={20} className="flex flex-col border-r border-border">
                <div className="p-4 border-b border-border bg-card shrink-0">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2">
                      Section Title
                    </label>
                    <Input
                      value={activeSection.title}
                      onChange={(e) => handleSectionChange('title', e.target.value)}
                      placeholder="Section Title"
                      className="font-display text-2xl font-bold border-transparent hover:border-border focus:border-primary shadow-none px-2 h-auto py-1 bg-transparent"
                    />
                  </div>
                </div>
                <div className="flex-1 p-4 min-h-0">
                  <Textarea
                    ref={textareaRef}
                    value={activeSection.content}
                    onChange={(e) => handleSectionChange('content', e.target.value)}
                    placeholder="Write markdown content here..."
                    className="h-full w-full resize-none border-0 focus-visible:ring-0 rounded-none bg-transparent shadow-none"
                  />
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Preview Pane */}
              <ResizablePanel defaultSize={50} minSize={20} className="flex flex-col bg-muted/10">
                <div className="p-4 border-b border-border bg-muted/20 shrink-0">
                  <span className="font-medium text-sm text-muted-foreground">Preview</span>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-8 max-w-3xl mx-auto">
                    <article className="prose prose-zinc dark:prose-invert prose-headings:font-display prose-headings:font-bold prose-h1:text-4xl prose-h2:text-3xl prose-h3:text-2xl prose-h4:text-xl prose-h5:text-lg prose-h6:text-base prose-a:text-primary max-w-none prose-p:leading-relaxed break-words">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        components={{ img: MarkdownImage }}
                        urlTransform={(value) => value}
                      >
                        {activeSection.content}
                      </ReactMarkdown>
                    </article>
                  </div>
                </ScrollArea>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              {sections.length === 0 ? 'Create a section to start writing.' : 'Select a section to edit.'}
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
