import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { BookOpen, Loader2, UserPlus, CheckCircle2, Mail } from 'lucide-react';
import { z } from 'zod';

const inviteSignUpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type InviteContext = {
  invite_id: string;
  company_id: string;
  company_name: string;
  email: string;
  permissions: string[];
  accepted_at: string | null;
};

const INVITE_PERMISSION_LABELS: Record<string, string> = {
  "page.portal": "Portal Settings",
  "page.manuals": "Documents & Folders",
  "page.analytics": "Analytics",
  "page.users": "User Management",
};

const Auth = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset'>(() => {
    if (window.location.hash.includes('type=recovery') || searchParams.get('mode') === 'reset') {
      return 'reset';
    }
    if (searchParams.get('invite')) {
      return 'signup';
    }
    if (searchParams.get('portal_invite')) {
      return 'signup';
    }
    return (searchParams.get('mode') as any) || 'signin';
  });
  const isSignUp = mode === 'signup';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [inviteContext, setInviteContext] = useState<InviteContext | null>(null);
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'loading' | 'valid' | 'expired' | 'accepted' | 'invalid'>(
    'idle'
  );

  type PortalInviteContext = {
    invite_id: string;
    company_id: string;
    company_name: string;
    company_slug: string;
    email: string;
    expires_at: string;
    accepted_at: string | null;
  };
  const [portalInviteContext, setPortalInviteContext] = useState<PortalInviteContext | null>(null);
  const [portalInviteStatus, setPortalInviteStatus] = useState<'idle' | 'loading' | 'valid' | 'expired' | 'accepted' | 'invalid'>('idle');
  const [showConfirmationEmail, setShowConfirmationEmail] = useState(false);

  const { signUp, signIn, resetPassword, updatePassword, user, loading, companyUserId, isSuperadmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const inviteToken = useMemo(() => searchParams.get('invite')?.trim() || null, [searchParams]);
  const portalInviteToken = useMemo(() => searchParams.get('portal_invite')?.trim() || null, [searchParams]);
  const inviteIsLoading = inviteStatus === 'loading';

  useEffect(() => {
    // Blocks redirect if we are in reset mode OR if there is a recovery hash in the URL
    const isRecovery = window.location.hash.includes('type=recovery') || mode === 'reset';
    if (!loading && user && !isRecovery) {
      if (companyUserId || isSuperadmin) {
        navigate('/dashboard');
      }
      // Portal-only users stay on this page; they should sign in via /company/:slug/login
    }
  }, [user, loading, navigate, mode, companyUserId, isSuperadmin]);

  useEffect(() => {
    const m = searchParams.get('mode');
    if (m === 'reset' || m === 'signup' || m === 'signin' || m === 'forgot') {
      setMode(m);
    } else if (searchParams.get('invite')) {
      setMode('signup');
    } else if (searchParams.get('portal_invite')) {
      setMode('signup');
    }
  }, [searchParams]);

  useEffect(() => {
    // Listen for the recovery event from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!inviteToken) {
      setInviteContext(null);
      setInviteStatus('idle');
      return;
    }

    setMode('signup');
    setInviteStatus('loading');

    (async () => {
      const { data, error } = await supabase.rpc('get_invite_context', {
        invite_token: inviteToken,
      });

      if (error || !data || data.length === 0) {
        setInviteContext(null);
        setInviteStatus('invalid');
        return;
      }

      const invite = data[0] as InviteContext;

      if (invite.accepted_at) {
        setInviteContext(invite);
        setInviteStatus('accepted');
        return;
      }

      setInviteContext(invite);
      setInviteStatus('valid');
      setEmail(invite.email);
    })();
  }, [inviteToken]);

  useEffect(() => {
    if (!portalInviteToken) {
      setPortalInviteContext(null);
      setPortalInviteStatus('idle');
      return;
    }
    setMode('signup');
    setPortalInviteStatus('loading');
    (async () => {
      const { data, error } = await supabase.rpc('get_portal_invite_context', {
        invite_token: portalInviteToken,
      });
      if (error || !data || data.length === 0) {
        setPortalInviteContext(null);
        setPortalInviteStatus('invalid');
        return;
      }
      const invite = data[0] as PortalInviteContext;
      if (invite.accepted_at) {
        setPortalInviteContext(invite);
        setPortalInviteStatus('accepted');
        return;
      }
      const expiresAt = new Date(invite.expires_at);
      if (expiresAt < new Date()) {
        setPortalInviteContext(invite);
        setPortalInviteStatus('expired');
        return;
      }
      setPortalInviteContext(invite);
      setPortalInviteStatus('valid');
      setEmail(invite.email);
    })();
  }, [portalInviteToken]);

  const validateForm = () => {
    setErrors({});

    try {
      if (isSignUp) {
        inviteSignUpSchema.parse({ email, password });
      } else if (isForgot) {
        forgotPasswordSchema.parse({ email });
      } else if (isReset) {
        resetPasswordSchema.parse({ password });
      } else {
        signInSchema.parse({ email, password });
      }
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      if (isSignUp) {
        const portalInviteTokenToSend = portalInviteStatus === 'valid' ? portalInviteToken ?? undefined : undefined;
        const companyInviteTokenToSend = inviteStatus === 'valid' ? inviteToken ?? undefined : undefined;
        const { session, error } = await signUp(email, password, undefined, companyInviteTokenToSend, portalInviteTokenToSend);
        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              variant: 'destructive',
              title: 'Account exists',
              description: 'This email is already registered. Please sign in instead.',
            });
          } else {
            toast({
              variant: 'destructive',
              title: 'Sign up failed',
              description: error.message,
            });
          }
        } else {
          // If session is null, it means email confirmation is required
          if (!session) {
            setShowConfirmationEmail(true);
            setIsSuccess(true);
            toast({
              title: 'Check your email',
              description: 'We sent you a confirmation link to finish creating your account.',
            });
          } else if (portalInviteContext?.company_slug) {
            toast({ title: 'Account created!', description: 'Redirecting to the portal...' });
            navigate(`/company/${portalInviteContext.company_slug}`);
          } else {
            toast({
              title: 'Account created!',
              description: 'Welcome to DokSights. Redirecting to your dashboard...',
            });
          }
        }
      } else if (isForgot) {
        const { error } = await resetPassword(email);
        if (error) {
          toast({
            variant: 'destructive',
            title: 'Reset failed',
            description: error.message,
          });
        } else {
          toast({
            title: 'Email sent!',
            description: 'Check your inbox for the password reset link.',
          });
          setMode('signin');
        }
      } else if (isReset) {
        const { error } = await updatePassword(password);
        if (error) {
          toast({
            variant: 'destructive',
            title: 'Update failed',
            description: error.message,
          });
        } else {
          toast({
            title: 'Password updated!',
            description: 'Your password has been changed successfully. Redirecting...',
          });
          navigate('/dashboard');
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast({
              variant: 'destructive',
              title: 'Invalid credentials',
              description: 'The email or password you entered is incorrect.',
            });
          } else {
            toast({
              variant: 'destructive',
              title: 'Sign in failed',
              description: error.message,
            });
          }
        } else {
          toast({
            title: 'Welcome back!',
            description: 'Redirecting to your dashboard...',
          });
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Portal-only users who ended up on /auth (e.g. via "Forgot password" link)
  const isPortalOnlyUser = !!user && !companyUserId && !isSuperadmin;
  if (isPortalOnlyUser && mode !== 'reset' && !window.location.hash.includes('type=recovery')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="border-border shadow-lg max-w-sm w-full">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <BookOpen className="h-10 w-10 text-primary" />
            <h2 className="text-lg font-semibold text-center">You're signed in</h2>
            <p className="text-sm text-muted-foreground text-center">
              Your account doesn't have dashboard access. Visit the company portal you were invited to.
            </p>
            <Button variant="outline" onClick={async () => {
              const { signOut } = await import('@/integrations/supabase/client').then(m => ({ signOut: m.supabase.auth.signOut.bind(m.supabase.auth) }));
              await signOut();
            }}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md animate-fade-in">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Link to="/" className="flex items-center gap-2">
              <BookOpen className="h-8 w-8 text-primary" />
              <span className="font-display text-2xl font-medium">DokSights</span>
            </Link>
          </div>

          <Card className="border-border shadow-lg">
            <CardHeader className="text-center">
              <CardTitle className="font-display text-2xl">
                {isSignUp && 'Create your account'}
                {mode === 'signin' && 'Welcome back'}
                {isForgot && 'Reset your password'}
                {isReset && 'Set new password'}
              </CardTitle>
            <CardDescription>
                {showConfirmationEmail && 'Click the link in your inbox to verify your account'}
                {isSignUp && !showConfirmationEmail && 'Start managing your product manuals today'}
                {mode === 'signin' && 'Sign in to access your dashboard'}
                {isForgot && 'We will send you a link to reset your password'}
                {isReset && 'Enter your new password below'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {showConfirmationEmail && isSuccess ? (
                <div className="flex flex-col items-center gap-6 py-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    {showConfirmationEmail ? (
                      <Mail className="h-6 w-6 text-primary" />
                    ) : (
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  {showConfirmationEmail && (
                    <div className="text-center space-y-2">
                      <p className="text-sm text-muted-foreground">
                        We've sent a confirmation email to <span className="font-medium text-foreground">{email}</span>.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Please check your inbox and click the button to verify your account.
                      </p>
                    </div>
                  )}
                  <Button variant="outline" className="w-full" onClick={() => {
                    setIsSuccess(false);
                    setShowConfirmationEmail(false);
                    setMode('signin');
                  }}>
                    Back to sign in
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {isSignUp && inviteStatus === 'valid' && inviteContext && (
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <UserPlus className="h-4 w-4 text-primary" />
                        Invitation to {inviteContext.company_name}
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        You will join with the permissions below.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {inviteContext.permissions.length > 0 ? (
                          inviteContext.permissions.map((permission) => (
                            <Badge key={permission} variant="outline">
                              {INVITE_PERMISSION_LABELS[permission] ?? permission}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="secondary">No permissions</Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {isSignUp && inviteStatus === 'expired' && (
                    <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
                      This invite has expired. You can still create a new company account.
                    </div>
                  )}

                  {isSignUp && inviteStatus === 'accepted' && (
                    <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
                      This invite has already been accepted. Please sign in instead.
                    </div>
                  )}

                  {isSignUp && inviteStatus === 'invalid' && (
                    <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
                      This invite link is invalid. You can still create a new company account.
                    </div>
                  )}

                  {isSignUp && inviteStatus === 'loading' && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading invitation details...
                    </div>
                  )}

                  {isSignUp && portalInviteToken && portalInviteStatus === 'valid' && portalInviteContext && (
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <UserPlus className="h-4 w-4 text-primary" />
                        Access invitation to {portalInviteContext.company_name}
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        Create an account to access the documentation portal.
                      </p>
                    </div>
                  )}
                  {isSignUp && portalInviteToken && portalInviteStatus === 'loading' && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading invitation details...
                    </div>
                  )}
                  {isSignUp && portalInviteToken && portalInviteStatus === 'expired' && (
                    <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
                      This portal invitation has expired. Contact the portal admin for a new invite.
                    </div>
                  )}
                  {isSignUp && portalInviteToken && portalInviteStatus === 'accepted' && (
                    <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
                      This invitation has already been accepted. Please sign in instead.
                    </div>
                  )}
                  {isSignUp && portalInviteToken && portalInviteStatus === 'invalid' && (
                    <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
                      This invitation link is invalid or has expired.
                    </div>
                  )}


                  {isSignUp && inviteStatus === 'valid' && (
                    <div className="space-y-2">
                      <Label>Company</Label>
                      <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                        {inviteContext?.company_name ?? 'Company'}
                      </div>
                    </div>
                  )}

                  {!isReset && (
                    <div className="space-y-2">
                      <Label htmlFor="email">Work Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading || ((inviteStatus === 'valid' || portalInviteStatus === 'valid') && isSignUp)}
                        className={errors.email ? 'border-destructive' : ''}
                      />
                      {errors.email && (
                        <p className="text-sm text-destructive">{errors.email}</p>
                      )}
                    </div>
                  )}

                  {!isForgot && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        {mode === 'signin' && (
                          <button
                            type="button"
                            onClick={() => setMode('forgot')}
                            className="text-sm text-primary hover:underline font-medium"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        className={errors.password ? 'border-destructive' : ''}
                      />
                      {errors.password && (
                        <p className="text-sm text-destructive">{errors.password}</p>
                      )}
                    </div>
                  )}


                  <Button type="submit" className="w-full" disabled={isLoading || inviteIsLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {isSignUp && 'Creating account...'}
                        {mode === 'signin' && 'Signing in...'}
                        {isForgot && 'Sending link...'}
                        {isReset && 'Updating password...'}
                      </>
                    ) : (
                      <>
                        {isSignUp && 'Create account'}
                        {mode === 'signin' && 'Sign in'}
                        {isForgot && 'Send reset link'}
                        {isReset && 'Update password'}
                      </>
                    )}
                  </Button>
                </form>
              )}

              <div className="mt-6 text-center text-sm text-muted-foreground">
                {!isSuccess && (isForgot || isReset) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsSuccess(false);
                      setMode('signin');
                    }}
                    className="text-primary hover:underline font-medium"
                  >
                    Back to sign in
                  </button>
                ) : !isSuccess && isSignUp ? (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('signin')}
                      className="text-primary hover:underline font-medium"
                    >
                      Sign in
                    </button>
                  </>
                ) : !isSuccess ? (
                  <>
                    Need an account?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('signup')}
                      className="text-primary hover:underline font-medium"
                    >
                      Create one
                    </button>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Auth;