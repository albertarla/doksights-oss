import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, LogOut, ArrowLeft, Eye, Clock, FileText, TrendingUp, Globe, MessageSquare, Loader2, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { toast } from 'sonner';
import { CHAT_API_CONFIG } from '@/config/chatApi';
import ReactMarkdown from 'react-markdown';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { ClassificationDonutChart, LABEL_COLORS, type LabelCount } from '@/components/analytics/ClassificationDonutChart';
import { CategoryTrendsChart, type DailyLabelData } from '@/components/analytics/CategoryTrendsChart';
import { TopThemesTable, type ChatTheme } from '@/components/analytics/TopThemesTable';

interface Manual {
  id: string;
  title: string;
  is_public: boolean;
}

interface ViewEvent {
  id: string;
  manual_id: string;
  link_id: string;
  viewed_at: string;
  reading_duration_seconds: number;
  pages_viewed: number;
  total_pages: number;
  hashed_identifier: string;
}

interface DailyViews {
  date: string;
  views: number;
}

interface ManualPerformance {
  name: string;
  views: number;
  avgDuration: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface ChatSession {
  id: string;
  chat_type: string;
  manual_id: string | null;
  created_at: string;
  updated_at: string;
  classification_attempts: number;
  label: string | null;
  conclusion: string | null;
  theme_id: string | null;
  ai_chat_messages: ChatMessage[];
  manuals?: { title: string };
}

interface TokenUsage {
  month: string;
  feature: string;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
}

const CHART_COLORS = [
  'hsl(220, 70%, 50%)',
  'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)',
  'hsl(270, 70%, 50%)',
];

const Analytics = () => {
  const { user, loading, signOut, companyId, license, isSuperadmin } = useAuth();
  const { canViewAnalytics } = usePermissions();
  const navigate = useNavigate();
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [viewEvents, setViewEvents] = useState<ViewEvent[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage[]>([]);
  const [selectedManual, setSelectedManual] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7');
  const [isLoading, setIsLoading] = useState(true);
  const [portalEnabled, setPortalEnabled] = useState(false);

  // Pagination for Recent Chats
  const [chatPage, setChatPage] = useState(0);
  const [paginatedChats, setPaginatedChats] = useState<ChatSession[]>([]);
  const [hasMoreChats, setHasMoreChats] = useState(false);
  const CHATS_PER_PAGE = 5;
  const [isChatsLoading, setIsChatsLoading] = useState(true);

  // Pagination for Top Themes
  const [themePage, setThemePage] = useState(0);
  const [paginatedThemes, setPaginatedThemes] = useState<ChatTheme[]>([]);
  const [hasMoreThemes, setHasMoreThemes] = useState(false);
  const THEMES_PER_PAGE = 5;
  const [isThemesLoading, setIsThemesLoading] = useState(true);

  // Reset pagination when filters change
  useEffect(() => {
    setChatPage(0);
    setThemePage(0);
  }, [selectedManual, dateRange]);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate('/auth');
      } else if (!canViewAnalytics && !isSuperadmin) {
        navigate('/dashboard');
        toast.error("You don't have permission to view analytics.");
      }
    }
  }, [user, loading, navigate, canViewAnalytics, isSuperadmin]);

  const hasAnalytics = isSuperadmin || license?.features?.analytics === true;

  const fetchData = useCallback(async () => {
    if (!companyId || !canViewAnalytics || !hasAnalytics) return;
    setIsLoading(true);

    // Fetch profile to check portal status (still need profile for portal status? Or company?)
    // Company has portal_enabled.
    const { data: company } = await supabase
      .from('companies')
      .select('portal_enabled')
      .eq('id', companyId)
      .single();

    if (company) {
      setPortalEnabled(company.portal_enabled);
    }

    // Fetch manuals (with public status)
    const { data: manualsData } = await supabase
      .from('manuals')
      .select('id, title, is_public')
      .eq('company_id', companyId);

    if (manualsData) {
      setManuals(manualsData);
    }

    // Fetch view events (portal traffic)
    const isAllTime = dateRange === 'all';
    const daysAgo = isAllTime ? 0 : parseInt(dateRange);
    const startDate = isAllTime ? null : subDays(new Date(), daysAgo).toISOString();

    let query = supabase
      .from('manual_views')
      .select('*')
      .eq('company_id', companyId)
      .order('viewed_at', { ascending: false });

    if (startDate) {
      query = query.gte('viewed_at', startDate);
    }

    if (selectedManual !== 'all') {
      query = query.eq('manual_id', selectedManual);
    }

    const { data: viewsData, error: viewsError } = await query;

    if (viewsError) {
      console.error('Error fetching views:', viewsError);
    } else if (viewsData) {
      setViewEvents(viewsData);
    }

    // Fetch chat sessions (metadata only for charts)
    let chatQuery = supabase
      .from('ai_chat_sessions')
      .select('id, chat_type, manual_id, created_at, updated_at, classification_attempts, label, conclusion, theme_id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (startDate) {
      chatQuery = chatQuery.gte('created_at', startDate);
    }

    if (selectedManual !== 'all') {
      chatQuery = chatQuery.eq('manual_id', selectedManual);
    }

    const { data: sessionsData, error: sessionsError } = await chatQuery.limit(1000);

    if (sessionsError) {
      console.error('Error fetching chat sessions:', sessionsError);
    } else if (sessionsData) {
      setChatSessions(sessionsData as unknown as ChatSession[]);
    }

    // Fetch token usage
    const { data: tokenData, error: tokenError } = await supabase
      .rpc('get_monthly_token_usage', { company_id_param: companyId });

    if (tokenError) {
      console.error('Error fetching token usage:', tokenError);
    } else if (tokenData) {
      setTokenUsage(tokenData);
    }

    setIsLoading(false);
  }, [companyId, dateRange, selectedManual, canViewAnalytics, hasAnalytics]);

  const fetchPaginatedChats = useCallback(async () => {
    if (!companyId || !canViewAnalytics || !hasAnalytics) return;
    setIsChatsLoading(true);

    const isAllTime = dateRange === 'all';
    const startDate = isAllTime ? null : subDays(new Date(), parseInt(dateRange)).toISOString();

    let query = supabase
      .from('ai_chat_sessions')
      .select(`
        *,
        manuals(title),
        ai_chat_messages(*)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .range(chatPage * CHATS_PER_PAGE, chatPage * CHATS_PER_PAGE + CHATS_PER_PAGE);

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (selectedManual !== 'all') {
      query = query.eq('manual_id', selectedManual);
    }

    const { data: pagedData, error } = await query;
    if (error) {
      console.error('Error fetching paginated chats:', error);
    } else if (pagedData) {
      const hasMore = pagedData.length > CHATS_PER_PAGE;
      setPaginatedChats(hasMore ? (pagedData.slice(0, CHATS_PER_PAGE) as unknown as ChatSession[]) : (pagedData as unknown as ChatSession[]));
      setHasMoreChats(hasMore);
    }
    setIsChatsLoading(false);
  }, [companyId, canViewAnalytics, hasAnalytics, dateRange, selectedManual, chatPage]);

  const fetchPaginatedThemes = useCallback(async () => {
    if (!companyId || !canViewAnalytics || !hasAnalytics) return;
    setIsThemesLoading(true);

    let query = supabase
      .from('ai_chat_themes')
      .select('id, label, title, session_count')
      .eq('company_id', companyId)
      .order('session_count', { ascending: false })
      .range(themePage * THEMES_PER_PAGE, (themePage * THEMES_PER_PAGE) + THEMES_PER_PAGE);

    const { data: themesData, error } = await query;
    if (error) {
      console.error('Error fetching themes:', error);
    } else if (themesData) {
      const hasMore = themesData.length > THEMES_PER_PAGE;
      setPaginatedThemes(hasMore ? (themesData.slice(0, THEMES_PER_PAGE) as unknown as ChatTheme[]) : (themesData as unknown as ChatTheme[]));
      setHasMoreThemes(hasMore);
    }
    setIsThemesLoading(false);
  }, [companyId, canViewAnalytics, hasAnalytics, themePage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchPaginatedChats();
  }, [fetchPaginatedChats]);

  useEffect(() => {
    fetchPaginatedThemes();
  }, [fetchPaginatedThemes]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!companyId || !canViewAnalytics || !hasAnalytics) return;

    const channel = supabase
      .channel('analytics-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'manual_views',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, fetchData, canViewAnalytics, hasAnalytics]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleTriggerAnalysis = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const response = await fetch(`${CHAT_API_CONFIG.BASE_URL}/analytics/classify-sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error("Failed to trigger analysis");
      toast.success("Analysis pipeline triggered in the background");
    } catch (error) {
      console.error(error);
      toast.error("Failed to trigger analysis");
    }
  };

  // Calculate stats
  const totalViews = viewEvents.length;
  const avgReadingTime = viewEvents.length > 0
    ? Math.round(viewEvents.reduce((sum, v) => sum + (v.reading_duration_seconds || 0), 0) / viewEvents.length)
    : 0;
  const avgPagesViewed = viewEvents.length > 0
    ? (viewEvents.reduce((sum, v) => sum + (v.pages_viewed || 1), 0) / viewEvents.length).toFixed(1)
    : '0';

  const uniqueVisitors = new Set(viewEvents.map(v => v.hashed_identifier).filter(Boolean)).size;

  // Prepare daily views chart data
  const isAllTime = dateRange === 'all';
  const daysAgo = isAllTime ? 0 : parseInt(dateRange);
  // For "all time", derive the date window from actual data (fallback: 365 days)
  const chartStartDate = isAllTime
    ? (viewEvents.length > 0
      ? startOfDay(new Date(viewEvents[viewEvents.length - 1].viewed_at))
      : subDays(new Date(), 365))
    : subDays(new Date(), daysAgo);

  const dateInterval = eachDayOfInterval({
    start: chartStartDate,
    end: new Date(),
  });

  const dailyViewsData: DailyViews[] = dateInterval.map((day) => {
    const dayStart = startOfDay(day);
    const dayViews = viewEvents.filter((v) => {
      const viewDate = startOfDay(new Date(v.viewed_at));
      return viewDate.getTime() === dayStart.getTime();
    }).length;
    return {
      date: format(day, 'MMM d'),
      views: dayViews,
    };
  });

  // Prepare manual performance data
  const manualPerformance: ManualPerformance[] = manuals.map((manual) => {
    const manualViews = viewEvents.filter((v) => v.manual_id === manual.id);
    const avgDuration = manualViews.length > 0
      ? Math.round(manualViews.reduce((sum, v) => sum + (v.reading_duration_seconds || 0), 0) / manualViews.length)
      : 0;
    return {
      name: manual.title.length > 20 ? manual.title.substring(0, 20) + '...' : manual.title,
      views: manualViews.length,
      avgDuration,
    };
  }).sort((a, b) => b.views - a.views).slice(0, 5);

  // Prepare pie chart data for view distribution
  const pieData = manualPerformance.map((m, i) => ({
    name: m.name,
    value: m.views,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  // Prepare Token Usage BarChart data
  const processedTokenData = Object.values(tokenUsage.reduce((acc, curr) => {
    // format to abbreviated month and year (e.g. Mar 2026)
    const monthStr = format(new Date(curr.month), 'MMM yyyy');
    if (!acc[monthStr]) {
      acc[monthStr] = { month: monthStr, total: 0 };
    }
    acc[monthStr][curr.feature] = curr.total_tokens;
    acc[monthStr].total = (Number(acc[monthStr].total) || 0) + curr.total_tokens;
    return acc;
  }, {} as Record<string, Record<string, number | string>>)).reverse();

  // Compute current period token total from tokenUsage (current calendar month)
  const currentMonthStr = format(new Date(), 'MMM yyyy');
  const currentMonthTokensUsed = tokenUsage
    .filter(t => format(new Date(t.month), 'MMM yyyy') === currentMonthStr)
    .reduce((sum, t) => sum + t.total_tokens, 0);
  const tokenLimit = license?.max_ai_tokens ?? null;
  const tokenPct = tokenLimit ? Math.min(100, Math.round((currentMonthTokensUsed / tokenLimit) * 100)) : 0;
  const tokenBarColor = tokenPct >= 100 ? '#ef4444' : tokenPct >= 80 ? '#f59e0b' : '#22c55e';

  const now = new Date();
  const daysRemaining = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;

  // Classification: label distribution (donut chart data)
  const labelCounts = useMemo<LabelCount[]>(() => {
    const counts: Record<string, number> = {};
    for (const s of chatSessions) {
      if (s.label) {
        counts[s.label] = (counts[s.label] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [chatSessions]);

  // Classification: daily label trend data (stacked bar chart)
  const dailyLabelData = useMemo<DailyLabelData[]>(() => {
    const isAllTimeMemo = dateRange === 'all';
    const trendStart = isAllTimeMemo
      ? (chatSessions.length > 0
        ? startOfDay(new Date(chatSessions[chatSessions.length - 1].created_at))
        : subDays(new Date(), 365))
      : subDays(new Date(), parseInt(dateRange));
    const days = eachDayOfInterval({
      start: trendStart,
      end: new Date(),
    });
    return days.map((day) => {
      const dayKey = format(day, 'MMM d');
      const entry: DailyLabelData = { date: dayKey };
      const daySessions = chatSessions.filter(
        (s) => s.label && startOfDay(new Date(s.created_at)).getTime() === startOfDay(day).getTime()
      );
      for (const s of daySessions) {
        if (s.label) {
          entry[s.label] = ((entry[s.label] as number) ?? 0) + 1;
        }
      }
      return entry;
    });
  }, [chatSessions, dateRange]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm hidden sm:inline">Dashboard</span>
            </Link>
            <div className="h-4 w-px bg-border shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
              <span className="font-display text-lg sm:text-xl font-medium truncate">Analytics</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="shrink-0 ml-2">
            <LogOut className="sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="container py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-medium">Portal Analytics</h1>
            <p className="mt-2 text-muted-foreground">
              Track how visitors engage with your public portal.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedManual} onValueChange={setSelectedManual}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Documentation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Documentation</SelectItem>
                {manuals.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Portal Status Alert */}
        {hasAnalytics && !portalEnabled && (
          <Card className="mb-8 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="flex items-center gap-3 py-4">
              <Globe className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">Portal is disabled</p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Enable your public portal in Dashboard settings to start receiving traffic.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!hasAnalytics ? (
          <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="py-12 text-center">
              <TrendingUp className="mx-auto h-12 w-12 text-amber-500 opacity-50 mb-4" />
              <h2 className="text-xl font-semibold text-amber-900 dark:text-amber-100 mb-2">Analytics not included</h2>
              <p className="text-amber-800 dark:text-amber-200">
                Your current license plan does not include access to Portal Analytics and AI Insights.
                Ask your instance admin to enable analytics for this workspace.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="traffic" className="space-y-6">
            <TabsList className="bg-muted border border-border">
              <TabsTrigger value="traffic">
                Portal Traffic
              </TabsTrigger>
              <TabsTrigger value="ai-insights">
                AI Insights
              </TabsTrigger>
              <TabsTrigger value="token-usage">
                Token Usage
              </TabsTrigger>
            </TabsList>

            <TabsContent value="traffic" className="space-y-6">
              {/* Key Metrics */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Unique Visitors</CardTitle>
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{isLoading ? '...' : uniqueVisitors}</div>
                    <p className="text-xs text-muted-foreground mt-1">daily distinct visitors</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Views</CardTitle>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{isLoading ? '...' : totalViews}</div>
                    <p className="text-xs text-muted-foreground mt-1">in selected period</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Reading Time</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {isLoading ? '...' : avgReadingTime > 60 ? `${Math.round(avgReadingTime / 60)} m` : `${avgReadingTime} s`}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">per session</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Pages Viewed</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{isLoading ? '...' : avgPagesViewed}</div>
                    <p className="text-xs text-muted-foreground mt-1">per session</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid gap-6 lg:grid-cols-2 mb-8">
                {/* Views Over Time */}
                <Card>
                  <CardHeader>
                    <CardTitle className="font-display text-lg">Portal Traffic</CardTitle>
                    <CardDescription>Daily view counts for the selected period</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="h-64 flex items-center justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      </div>
                    ) : totalViews === 0 ? (
                      <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                        <Eye className="h-8 w-8 mb-2 opacity-50" />
                        <p className="text-sm">No portal views yet in this period</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={256}>
                        <AreaChart data={dailyViewsData}>
                          <defs>
                            <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(220, 70%, 50%)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(220, 70%, 50%)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
                          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 45%)" />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 45%)" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(0, 0%, 100%)',
                              border: '1px solid hsl(220, 15%, 90%)',
                              borderRadius: '8px',
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="views"
                            stroke="hsl(220, 70%, 50%)"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorViews)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Manual Performance */}
                <Card>
                  <CardHeader>
                    <CardTitle className="font-display text-lg">Manual Performance</CardTitle>
                    <CardDescription>Top manuals by view count</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="h-64 flex items-center justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      </div>
                    ) : manualPerformance.length === 0 || totalViews === 0 ? (
                      <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                        <FileText className="h-8 w-8 mb-2 opacity-50" />
                        <p className="text-sm">No manual views yet</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={256}>
                        <BarChart data={manualPerformance} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 45%)" />
                          <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 45%)" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(0, 0%, 100%)',
                              border: '1px solid hsl(220, 15%, 90%)',
                              borderRadius: '8px',
                            }}
                          />
                          <Bar dataKey="views" fill="hsl(220, 70%, 50%)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* View Distribution Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-lg">View Distribution</CardTitle>
                  <CardDescription>How views are distributed across your public manuals</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="h-64 flex items-center justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  ) : pieData.length === 0 || totalViews === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                      <TrendingUp className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">Enable your portal and make manuals public to start tracking</p>
                    </div>
                  ) : (
                    <div className="flex flex-col lg:flex-row items-center gap-6">
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            label={({ percent }) => percent > 0 ? `${(percent * 100).toFixed(0)}% ` : ''}
                            labelLine={false}
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell - ${index} `} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(0, 0%, 100%)',
                              border: '1px solid hsl(220, 15%, 90%)',
                              borderRadius: '8px',
                            }}
                            formatter={(value: number, name: string) => [`${value} views`, name]}
                          />
                          <Legend
                            layout="vertical"
                            align="right"
                            verticalAlign="middle"
                            wrapperStyle={{ paddingLeft: '20px' }}
                            formatter={(value: string) => (
                              <span className="text-sm text-foreground">{value}</span>
                            )}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ai-insights" className="space-y-6">
              {/* Classification Distribution */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-display text-lg">Session Classification</CardTitle>
                    <CardDescription>
                      Distribution of AI conversations by feedback category.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ClassificationDonutChart data={labelCounts} isLoading={isLoading} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="font-display text-lg">Category Trends</CardTitle>
                    <CardDescription>
                      Daily breakdown of session categories over the selected period.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CategoryTrendsChart data={dailyLabelData} isLoading={isLoading} />
                  </CardContent>
                </Card>
              </div>

              {/* Top Themes */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-lg">Top Themes</CardTitle>
                  <CardDescription>
                    Recurring topics automatically grouped by semantic similarity.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TopThemesTable
                    themes={paginatedThemes}
                    isLoading={isThemesLoading}
                    currentPage={themePage}
                    hasMore={hasMoreThemes}
                    onPageChange={setThemePage}
                  />
                </CardContent>
              </Card>

              {/* Recent Conversations */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="space-y-1">
                    <CardTitle className="font-display text-lg">Recent AI Conversations</CardTitle>
                    <CardDescription>
                      Explore the latest questions users asked the AI on your portal or manuals.
                    </CardDescription>
                  </div>
                  {isSuperadmin && (
                    <Button variant="outline" size="sm" onClick={handleTriggerAnalysis} className="gap-2">
                      <Play className="h-3 w-3" />
                      Run Analysis Now
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {isChatsLoading ? (
                    <div className="h-64 flex items-center justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  ) : paginatedChats.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No AI conversations tracked yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {paginatedChats.map((session) => (
                        <div key={session.id} className="border rounded-lg p-4 space-y-4">
                          <div className="flex justify-between items-start bg-muted/50 p-2 rounded text-sm gap-2">
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="font-medium truncate">
                                {session.chat_type === 'discovery' ? 'Portal Discovery' : `Manual: ${session.manuals?.title || 'Unknown'}`}
                              </span>
                              {session.label ? (
                                <span
                                  className="text-xs text-white rounded px-1.5 py-0.5 self-start"
                                  style={{ backgroundColor: LABEL_COLORS[session.label] ?? 'hsl(220,10%,55%)' }}
                                >
                                  {session.label}
                                </span>
                              ) : session.classification_attempts >= 3 ? (
                                <span className="text-xs text-red-600 bg-red-100 rounded px-1.5 py-0.5 self-start border border-red-200">
                                  Analysis Failed
                                </span>
                              ) : new Date(session.updated_at).getTime() < Date.now() - 2 * 60 * 60 * 1000 ? (
                                <span className="text-xs flex items-center gap-1 text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded self-start border border-amber-200">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Queued for Analysis
                                </span>
                              ) : (
                                <span className="text-xs flex items-center gap-1 text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded self-start border border-blue-200">
                                  <Clock className="h-3 w-3" />
                                  Active / Waiting
                                </span>
                              )}
                            </div>
                            <span className="text-muted-foreground shrink-0">{new Date(session.created_at).toLocaleString()}</span>
                          </div>

                          <div className="space-y-3 pl-2">
                            {session.ai_chat_messages && session.ai_chat_messages
                              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                              .map((msg) => (
                                <div key={msg.id} className="text-sm">
                                  <span className={`font-semibold ${msg.role === 'user' ? 'text-primary' : 'text-blue-600'}`}>
                                    {msg.role === 'user' ? 'User:' : 'AI:'}
                                  </span>
                                  <div className="mt-1 text-muted-foreground prose prose-sm max-w-none prose-p:leading-snug prose-p:my-1 line-clamp-2 hover:line-clamp-none transition-all cursor-pointer">
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}

                      <div className="flex items-center justify-between pt-4 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setChatPage(p => Math.max(0, p - 1))}
                          disabled={chatPage === 0}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          Page {chatPage + 1}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setChatPage(p => p + 1)}
                          disabled={!hasMoreChats}
                        >
                          Next
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="token-usage" className="space-y-6">
              {/* Token Quota Card — shown only when a limit is configured */}
              {tokenLimit !== null && (
                <Card className={tokenPct >= 100 ? 'border-red-500/60 bg-red-50 dark:bg-red-950/20' : tokenPct >= 80 ? 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/20' : ''}>
                  <CardHeader className="pb-3">
                    <CardTitle className="font-display text-lg flex items-center gap-2">
                      {tokenPct >= 100 ? '🚫' : tokenPct >= 80 ? '⚠️' : '✅'} AI Token Quota
                    </CardTitle>
                    <CardDescription>
                      Monthly token consumption vs. your license limit (resets on the 1st of each month — <strong className="font-semibold text-foreground">{daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining</strong>).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {tokenPct >= 100 && (
                      <div className="rounded-md bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 px-4 py-3 text-sm font-medium text-red-800 dark:text-red-200">
                        ⛔ AI token quota reached. All AI features are currently blocked for your company. Ask your instance admin to raise the limit.
                      </div>
                    )}
                    {/* Progress bar */}
                    <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className="h-3 rounded-full transition-all duration-500"
                        style={{ width: `${tokenPct}%`, backgroundColor: tokenBarColor }}
                      />
                    </div>
                    {/* Stat chips */}
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="rounded-lg border bg-background p-3">
                        <p className="text-xs text-muted-foreground mb-1">Used this period</p>
                        <p className="text-lg font-bold">{currentMonthTokensUsed.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border bg-background p-3">
                        <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                        <p className="text-lg font-bold" style={{ color: tokenBarColor }}>
                          {Math.max(0, tokenLimit - currentMonthTokensUsed).toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-3">
                        <p className="text-xs text-muted-foreground mb-1">Monthly Limit</p>
                        <p className="text-lg font-bold">{tokenLimit.toLocaleString()}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                      {currentMonthTokensUsed.toLocaleString()} / {tokenLimit.toLocaleString()} tokens used ({tokenPct}%)
                    </p>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-lg">AI Token Usage & Cost Estimation</CardTitle>
                  <CardDescription>Monthly aggregated token consumption by feature stack.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="h-64 flex items-center justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  ) : processedTokenData.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                      <TrendingUp className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No token usage data recorded yet.</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={processedTokenData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Bar dataKey="manual_indexing" name="Manual Indexing" fill="hsl(220, 70%, 50%)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="chat_manual" name="Manual Chat" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="chat_discovery" name="Discovery Chat" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="total" name="Total Consumption" fill="hsl(215, 16%, 47%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default Analytics;