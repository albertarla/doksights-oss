import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { PortalSearch } from "@/components/portal/PortalSearch";
import { FolderGrid } from "@/components/portal/FolderGrid";
import { ManualGrid } from "@/components/portal/ManualGrid";
import { PortalManualViewer } from "@/components/portal/PortalManualViewer";
import { WebManualViewer } from "@/components/portal/WebManualViewer";
import DiscoveryChat from "@/components/dashboard/DiscoveryChat";
import { Button } from "@/components/ui/button";
import { MessageCircle, LogOut, LogIn } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { toPublicStorageUrl } from "@/lib/storageUrl";
import { hexToHsl, isLightColor, getThemeVariables } from "@/lib/utils";

interface Manual {
  id: string;
  title: string;
  description: string | null;
  manualType?: 'pdf' | 'web';
  pageCount: number | null;
  folderId: string | null;
  displayOrder: number;
  createdAt: string;
  pdfUrl: string;
}

interface Folder {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  manuals: Manual[];
}

interface PortalData {
  company: {
    name: string;
    description: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    backgroundColor: string | null;
  };
  folders: Folder[];
  uncategorizedManuals: Manual[];
  totalManuals: number;
}

export default function CompanyPortal() {
  const { companySlug } = useParams<{ companySlug: string }>();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedManual, setSelectedManual] = useState<Manual | null>(null);
  const [discoveryChatOpen, setDiscoveryChatOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    async function fetchPortalData() {
      if (!companySlug) {
        setError("Invalid company URL");
        setLoading(false);
        return;
      }

      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "get-company-portal",
          {
            body: { companySlug },
          }
        );

        // Check specific error codes from the Edge Function FIRST.
        // supabase.functions.invoke() sets fnError on 4xx but the body
        // (containing the error code) is still available in data.
        if (data?.error === 'PRIVATE_PORTAL') {
          setLoading(false);
          navigate(`/company/${companySlug}/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        if (data?.error === 'PORTAL_ACCESS_DENIED') {
          setError('You do not have permission to access this portal.');
          setLoading(false);
          return;
        }

        if (fnError) {
          console.error("Error fetching portal:", fnError);
          setError("Unable to load company portal");
          return;
        }

        if (data?.error) {
          setError(data.error);
          return;
        }

        const fixUrl = (m: Manual): Manual => ({ ...m, pdfUrl: toPublicStorageUrl(m.pdfUrl) as string });
        setPortalData({
          ...data,
          uncategorizedManuals: (data?.uncategorizedManuals ?? []).map(fixUrl),
          folders: (data?.folders ?? []).map((f: Folder) => ({ ...f, manuals: (f.manuals ?? []).map(fixUrl) })),
        });
      } catch (err) {
        console.error("Unexpected error:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchPortalData();
  }, [companySlug]);

  // Filter manuals based on search query
  const filteredData = useMemo(() => {
    if (!portalData || !searchQuery.trim()) {
      return portalData;
    }

    const query = searchQuery.toLowerCase().trim();

    const filterManuals = (manuals: Manual[]) =>
      manuals.filter(
        (m) =>
          m.title.toLowerCase().includes(query) ||
          (m.description && m.description.toLowerCase().includes(query))
      );

    const filteredFolders = portalData.folders
      .map((folder) => ({
        ...folder,
        manuals: filterManuals(folder.manuals),
      }))
      .filter(
        (folder) =>
          folder.manuals.length > 0 ||
          folder.name.toLowerCase().includes(query)
      );

    const filteredUncategorized = filterManuals(portalData.uncategorizedManuals);

    return {
      ...portalData,
      folders: filteredFolders,
      uncategorizedManuals: filteredUncategorized,
    };
  }, [portalData, searchQuery]);

  // Build custom theme styles
  const customThemeStyles = useMemo(() => {
    return getThemeVariables(portalData?.company?.primaryColor, portalData?.company?.backgroundColor) as React.CSSProperties;
  }, [portalData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-6xl mx-auto px-4 py-8">
          <Skeleton className="h-12 w-64 mb-4" />
          <Skeleton className="h-6 w-96 mb-8" />
          <Skeleton className="h-10 w-full max-w-md mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" style={customThemeStyles}>
        <div className="text-center max-w-md px-4">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Portal Not Available
          </h1>
          <p className="text-muted-foreground mb-8">{error}</p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {user ? (
              <Button 
                variant="outline" 
                onClick={() => signOut()}
                className="w-full sm:w-auto"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out / Switch Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate(`/company/${companySlug}/login`)}
                className="w-full sm:w-auto"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            )}
            
            <Button 
              variant="ghost" 
              onClick={() => navigate("/")}
              className="w-full sm:w-auto"
            >
              Go to Homepage
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!filteredData) {
    return null;
  }

  const hasResults =
    filteredData.folders.some((f) => f.manuals.length > 0) ||
    filteredData.uncategorizedManuals.length > 0;

  // If a manual is selected, show the inline viewer
  if (selectedManual) {
    if (selectedManual.manualType === 'web') {
      return (
        <WebManualViewer
          manual={selectedManual}
          onBack={() => setSelectedManual(null)}
          companyName={filteredData.company.name}
          primaryColor={portalData?.company?.primaryColor}
          backgroundColor={portalData?.company?.backgroundColor}
        />
      );
    }
    
    return (
      <PortalManualViewer
        manual={selectedManual}
        onBack={() => setSelectedManual(null)}
        companyName={filteredData.company.name}
        primaryColor={portalData?.company?.primaryColor}
        backgroundColor={portalData?.company?.backgroundColor}
      />
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden" style={customThemeStyles}>
      <PortalHeader
        companyName={filteredData.company.name}
        description={filteredData.company.description}
        totalManuals={portalData?.totalManuals || 0}
        logoUrl={filteredData.company.logoUrl}
        primaryColor={portalData?.company?.primaryColor || undefined}
      />

      <ResizablePanelGroup direction="horizontal" key={`portal-layout-${discoveryChatOpen}`} className="flex-1 flex overflow-hidden relative">
        <ResizablePanel 
          id="main-grid"
          order={1}
          defaultSize={discoveryChatOpen && !isMobile ? 75 : 100} 
          minSize={30} 
          className="flex flex-col"
        >
          <div className="flex-1 overflow-y-auto">
            <main className="container max-w-6xl mx-auto px-4 py-8">
              <PortalSearch
                value={searchQuery}
                onChange={setSearchQuery}
                resultCount={
                  filteredData.folders.reduce((acc, f) => acc + f.manuals.length, 0) +
                  filteredData.uncategorizedManuals.length
                }
                isFiltering={!!searchQuery.trim()}
              />

              {!hasResults && searchQuery.trim() ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    No documentation found matching "{searchQuery}"
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Folders with documentation */}
                  {filteredData.folders.map((folder) => (
                    <FolderGrid
                      key={folder.id}
                      folder={folder}
                      onSelectManual={setSelectedManual}
                    />
                  ))}

                  {/* Uncategorized manuals */}
                  {filteredData.uncategorizedManuals.length > 0 && (
                    <div>
                      {filteredData.folders.length > 0 && (
                        <h2 className="text-lg font-semibold text-foreground mb-4">
                          Other Documents
                        </h2>
                      )}
                      <ManualGrid
                        manuals={filteredData.uncategorizedManuals}
                        onSelectManual={setSelectedManual}
                      />
                    </div>
                  )}
                </div>
              )}
            </main>
          </div>
        </ResizablePanel>

        {discoveryChatOpen && (
          <>
            <ResizableHandle
              withHandle
              className={isMobile ? "hidden" : ""}
            />
            <ResizablePanel
              id="discovery-chat"
              order={2}
              defaultSize={25} 
              minSize={20} 
              maxSize={50}
              className={isMobile ? 'absolute inset-0 z-50 bg-background' : ''}
            >
              <DiscoveryChat
                isOpen={discoveryChatOpen}
                onClose={() => setDiscoveryChatOpen(false)}
                companySlug={companySlug}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Discovery Chat Toggle Button */}
      {filteredData.totalManuals > 0 && !discoveryChatOpen && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            size="lg"
            onClick={() => setDiscoveryChatOpen(true)}
            className="shadow-lg"
          >
            <MessageCircle className="h-5 w-5 mr-2" />
            Find a Document
          </Button>
        </div>
      )}
    </div>
  );
}
