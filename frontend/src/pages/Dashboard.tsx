import { useEffect, useState, useCallback } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, LogOut, FileText, BarChart3, TrendingUp, Globe, FolderOpen, Users, ExternalLink, Settings, LayoutGrid, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Profile {
  company_name: string;
  email: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
  portal_enabled: boolean;
  portal_description: string | null;
  logo_url: string | null;
  portal_primary_color: string | null;
  portal_background_color: string | null;
}

interface Folder {
  id: string;
  name: string;
}

interface Manual {
  id: string;
  title: string;
  folder_id: string | null;
  is_public: boolean;
}

const Dashboard = () => {
  const { user, loading, signOut, companyId, isSuperadmin, license } = useAuth();
  const { canEditPortal, canEditManuals, canManageUsers, canViewAnalytics } = usePermissions();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [manualsLoading, setManualsLoading] = useState(true);
  const [currentMonthTokens, setCurrentMonthTokens] = useState<number>(0);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const fetchProfile = useCallback(async () => {
    if (user && companyId) {
      const { data: companyData } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .maybeSingle();

      if (companyData) {
        setCompany(companyData as Company);
        setProfile({
          company_name: companyData.name,
          email: user.email || '',
        });
      }
      setProfileLoading(false);
    }
  }, [user, companyId]);

  const fetchManuals = useCallback(async () => {
    if (companyId) {
      setManualsLoading(true);
      const { data, error } = await supabase
        .from('manuals')
        .select('id, title, folder_id, is_public')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setManuals(data as Manual[]);
      }
      setManualsLoading(false);
    }
  }, [companyId]);

  const fetchFolders = useCallback(async () => {
    if (companyId) {
      const { data, error } = await supabase
        .from('folders')
        .select('id, name')
        .eq('company_id', companyId)
        .order('display_order', { ascending: true });

      if (!error && data) {
        setFolders(data);
      }
    }
  }, [companyId]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchManuals();
      fetchFolders();
      // Fetch current month token usage for the quota widget
      if (companyId && license?.max_ai_tokens != null) {
        supabase
          .rpc('get_monthly_token_usage', { company_id_param: companyId })
          .then(({ data }) => {
            if (data) {
              const currentMonthStr = format(new Date(), 'MMM yyyy');
              const used = (data as any[]).filter((t: any) =>
                format(new Date(t.month), 'MMM yyyy') === currentMonthStr
              ).reduce((sum: number, t: any) => sum + (t.total_tokens || 0), 0);
              setCurrentMonthTokens(used);
            }
          });
      }
    }
  }, [user, fetchProfile, fetchManuals, fetchFolders, companyId, license?.max_ai_tokens]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const portalUrl = company?.slug
    ? `${window.location.origin}/company/${company.slug}`
    : null;

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const folderStructure = [
    { id: 'uncategorized', name: 'Uncategorized', manuals: manuals.filter(m => !m.folder_id) },
    ...folders.map(f => ({
      ...f,
      manuals: manuals.filter(m => m.folder_id === f.id)
    }))
  ].filter(f => f.manuals.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
            <BookOpen className="h-6 w-6 text-primary flex-shrink-0" />
            <span className="font-display text-xl font-medium truncate">DokSights</span>
          </div>
          <div className="flex items-center gap-4 min-w-0 ml-4">
            <span className="text-sm text-muted-foreground truncate hidden sm:inline">
              {profileLoading ? '...' : profile?.company_name}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="flex-shrink-0">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="font-display text-3xl font-medium">
              Dashboard
            </h1>
            <p className="mt-2 text-muted-foreground">
              Overview of your company's documentation and portal status.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {isSuperadmin && (
              <Button variant="default" asChild>
                <Link to="/superadmin">
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Superadmin
                </Link>
              </Button>
            )}
            {canEditPortal && (
              <Button variant="outline" asChild>
                <Link to="/dashboard/portal">
                  <Settings className="h-4 w-4 mr-2" />
                  Portal Settings
                </Link>
              </Button>
            )}
            {canEditManuals && (
              <Button variant="outline" asChild>
                <Link to="/dashboard/manuals">
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Manage Documents
                </Link>
              </Button>
            )}
            {canManageUsers && (
              <Button variant="outline" asChild>
                <Link to="/dashboard/users">
                  <Users className="h-4 w-4 mr-2" />
                  Users
                </Link>
              </Button>
            )}
            {canViewAnalytics && (
              <Button variant="outline" asChild>
                <Link to="/analytics">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Analytics
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Portal Status</CardTitle>
              <Globe className={`h-5 w-5 ${company?.portal_enabled ? 'text-green-500' : 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className={`text-sm font-medium ${company?.portal_enabled ? 'text-green-600' : 'text-orange-600'}`}>
                  {company?.portal_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {company?.logo_url && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Logo</span>
                  <img src={company.logo_url} alt="Logo" className="h-8 w-auto object-contain" />
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Colors</span>
                <div className="flex gap-2">
                  <div className="h-6 w-6 rounded border" style={{ backgroundColor: company?.portal_primary_color || '#3b82f6' }} title="Primary Color" />
                  <div className="h-6 w-6 rounded border" style={{ backgroundColor: company?.portal_background_color || '#ffffff' }} title="Background Color" />
                </div>
              </div>

              {company?.portal_description && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Description</span>
                  <p className="text-sm line-clamp-2">{company.portal_description}</p>
                </div>
              )}

              {company?.portal_enabled && portalUrl && (
                <div className="pt-2">
                  <Button variant="outline" className="w-full" asChild>
                    <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Public Portal
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">Content Summary</CardTitle>
              <FileText className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Documents</span>
                <span className="text-sm font-medium">{manuals.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Public Documents</span>
                <span className="text-sm font-medium">{manuals.filter(m => m.is_public).length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Folders</span>
                <span className="text-sm font-medium">{folders.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Token Quota Widget — shown only when license has a limit */}
        {license?.max_ai_tokens != null && (() => {
          const limit = license.max_ai_tokens as number;
          const pct = Math.min(100, Math.round((currentMonthTokens / limit) * 100));
          const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';
          return (
            <Card className={`mb-8 ${pct >= 100 ? 'border-red-500/60 bg-red-50 dark:bg-red-950/20' :
              pct >= 80 ? 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/20' : ''
              }`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <Zap className={`h-5 w-5 ${pct >= 100 ? 'text-red-500' : pct >= 80 ? 'text-amber-500' : 'text-green-500'
                    }`} />
                  AI Token Usage
                </CardTitle>
                {canViewAnalytics && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/analytics">View Details</Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {pct >= 100 && (
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">
                    ⛔ Quota reached — all AI features are blocked. Ask your instance admin to raise the limit.
                  </p>
                )}
                {pct >= 80 && pct < 100 && (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    ⚠️ Approaching limit — {100 - pct}% remaining.
                  </p>
                )}
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Used: {currentMonthTokens.toLocaleString()} tokens</span>
                  <span>Limit: {limit.toLocaleString()} / month</span>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              <CardTitle>Documents & Folder Structure</CardTitle>
            </div>
            <CardDescription>
              A read-only view of your organization's manuals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {manualsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : folderStructure.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No manuals found.</p>
                {canEditManuals && (
                  <Button variant="link" asChild>
                    <Link to="/dashboard/manuals">Go to management to upload manuals</Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {folderStructure.map((folder) => (
                  <div key={folder.id} className="space-y-3">
                    <h3 className="font-medium flex items-center gap-2 text-foreground/80">
                      <FolderOpen className="h-4 w-4" />
                      {folder.name}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {folder.manuals.map((manual) => (
                        <Link
                          key={manual.id}
                          to={`/manual/${manual.id}`}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm font-medium truncate">{manual.title}</span>
                          {manual.is_public && (
                            <span title="Public" className="ms-auto shrink-0 flex items-center">
                              <Globe className="h-3 w-3 text-muted-foreground" />
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;
