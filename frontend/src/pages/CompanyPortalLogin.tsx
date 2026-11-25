import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogOut } from 'lucide-react';
import { getThemeVariables } from '@/lib/utils';

interface CompanyBranding {
  id: string;
  name: string;
  logo_url: string | null;
  portal_primary_color: string | null;
  portal_background_color: string | null;
}

export default function CompanyPortalLogin() {
  const { companySlug } = useParams<{ companySlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyBranding, setCompanyBranding] = useState<CompanyBranding | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(true);

  const returnTo = searchParams.get('returnTo') || `/company/${companySlug}`;

  // Fetch company branding
  useEffect(() => {
    if (!companySlug) return;

    (async () => {
      const { data, error: fetchError } = await supabase
        .from('companies')
        .select('id, name, logo_url, portal_primary_color, portal_background_color')
        .eq('slug', companySlug)
        .eq('portal_enabled', true)
        .single();

      if (fetchError || !data) {
        setError('This portal does not exist or is not enabled.');
        setBrandingLoading(false);
        return;
      }

      setCompanyBranding(data as CompanyBranding);
      setBrandingLoading(false);
    })();
  }, [companySlug]);

  // If user is already authenticated on mount, check portal access and auto-redirect
  useEffect(() => {
    if (authLoading || !user || !companyBranding) return;

    let cancelled = false;

    const checkAccess = async (attempt = 0): Promise<void> => {
      const [{ data: portalUser }, { data: companyUser }] = await Promise.all([
        supabase
          .from('portal_users')
          .select('id')
          .eq('company_id', companyBranding.id)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('company_users')
          .select('id')
          .eq('company_id', companyBranding.id)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (portalUser || companyUser) {
        navigate(returnTo, { replace: true });
      } else if (attempt < 2) {
        // Retry after a short delay — the handle_new_user trigger may not
        // have finished inserting the portal_users row yet.
        await new Promise((r) => setTimeout(r, 1000));
        if (!cancelled) await checkAccess(attempt + 1);
      } else {
        setError('You do not have access to this portal.');
      }
    };

    checkAccess();

    return () => { cancelled = true; };
  }, [user, authLoading, companyBranding, navigate, returnTo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(
          signInError.message.includes('Invalid login credentials')
            ? 'The email or password is incorrect.'
            : signInError.message,
        );
        return;
      }

      if (!signInData.user || !companyBranding) return;

      // Check portal access
      const [{ data: portalUser }, { data: companyUser }] = await Promise.all([
        supabase
          .from('portal_users')
          .select('id')
          .eq('company_id', companyBranding.id)
          .eq('user_id', signInData.user.id)
          .maybeSingle(),
        supabase
          .from('company_users')
          .select('id')
          .eq('company_id', companyBranding.id)
          .eq('user_id', signInData.user.id)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      if (portalUser || companyUser) {
        toast({ title: 'Welcome back!', description: 'Redirecting to the portal...' });
        navigate(returnTo, { replace: true });
      } else {
        await supabase.auth.signOut();
        setError('You do not have access to this portal.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const customThemeStyles = getThemeVariables(
    companyBranding?.portal_primary_color,
    companyBranding?.portal_background_color,
  ) as React.CSSProperties;

  if (authLoading || brandingLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 bg-background"
      style={customThemeStyles}
    >
      <div className="w-full max-w-sm">
        {/* Company branding */}
        <div className="flex flex-col items-center gap-4 mb-8">
          {companyBranding?.logo_url ? (
            <img
              src={companyBranding.logo_url}
              alt={companyBranding.name}
              className="h-16 w-auto object-contain"
            />
          ) : null}
          {companyBranding && (
            <p className="text-muted-foreground text-sm text-center">
              Sign in to access the{' '}
              <span className="font-medium text-foreground">{companyBranding.name}</span>{' '}
              documentation portal
            </p>
          )}
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-semibold">Sign in</CardTitle>
            {error && !isLoading && (
              <div className="mt-2 space-y-4">
                <CardDescription className="text-destructive">{error}</CardDescription>
                {user && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => supabase.auth.signOut()}
                    className="mx-auto"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out / Switch Account
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/auth?mode=forgot"
                    className="text-sm text-primary hover:underline font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
