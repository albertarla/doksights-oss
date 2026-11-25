import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface LicenseType {
  id: string;
  name: string;
  max_manuals: number;
  max_public_manuals: number;
  max_users: number;
  max_ai_tokens: number | null;  // null = unlimited
  features: {
    analytics?: boolean;
    [key: string]: any;
  };
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  companyId: string | null;
  companyUserId: string | null;
  license: LicenseType | null;
  permissions: string[];
  isSuperadmin: boolean;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    companyName?: string,
    inviteToken?: string,
    portalInviteToken?: string,
  ) => Promise<{ session: Session | null; error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyUserId, setCompanyUserId] = useState<string | null>(null);
  const [license, setLicense] = useState<LicenseType | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshPermissions = async (cuId?: string) => {
    const idToUse = cuId || companyUserId;
    if (!idToUse) return;

    const { data: perms } = await supabase
      .from('company_user_permissions')
      .select('permission_key')
      .eq('company_user_id', idToUse);

    if (perms) {
      setPermissions(perms.map(p => p.permission_key));
    } else {
      setPermissions([]);
    }
  };

  const fetchCompanyData = async (userId: string) => {
    try {
      // Fetch profile for superadmin status
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_superadmin')
        .eq('id', userId)
        .maybeSingle();
        
      if (profile) {
        setIsSuperadmin(!!profile.is_superadmin);
      } else {
        setIsSuperadmin(false);
      }

      // Fetch company (assume 1 user -> 1 company for now, or get active one)
      const { data: companyUser } = await supabase
        .from('company_users')
        .select('id, company_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      if (companyUser) {
        setCompanyId(companyUser.company_id);
        setCompanyUserId(companyUser.id);
        await refreshPermissions(companyUser.id);
        
        // Fetch License Data
        const { data: licenseData } = await supabase
          .from('company_licenses')
          .select(`
            licenses (
              id,
              name,
              max_manuals,
              max_public_manuals,
              max_users,
              max_ai_tokens,
              features
            )
          `)
          .eq('company_id', companyUser.company_id)
          .eq('subscription_status', 'active')
          .maybeSingle();
          
        if (licenseData?.licenses) {
          // Type cast because features is JSON
          setLicense(licenseData.licenses as unknown as LicenseType);
        } else {
          setLicense(null);
        }

      } else {
        setCompanyId(null);
        setCompanyUserId(null);
        setPermissions([]);
        setLicense(null);
      }
    } catch (error) {
      console.error('Error fetching company data:', error);
      setCompanyId(null);
      setCompanyUserId(null);
      setPermissions([]);
      setLicense(null);
      setIsSuperadmin(false);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          fetchCompanyData(currentUser.id).then(() => setLoading(false));
        } else {
          setCompanyId(null);
          setCompanyUserId(null);
          setPermissions([]);
          setLicense(null);
          setIsSuperadmin(false);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchCompanyData(session.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Set up Realtime subscription for permissions
  useEffect(() => {
    if (!companyUserId) return;

    const channel = supabase
      .channel(`perms:${companyUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_user_permissions',
          filter: `company_user_id=eq.${companyUserId}`,
        },
        () => {
          refreshPermissions(companyUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyUserId]);

  const signUp = async (email: string, password: string, companyName?: string, inviteToken?: string, portalInviteToken?: string) => {
    const metadata: Record<string, string> = {
      company_name: companyName || '',
    };
    // Company invite takes precedence over portal invite
    if (inviteToken) {
      metadata.invite_token = inviteToken;
    } else if (portalInviteToken) {
      metadata.portal_invite_token = portalInviteToken;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    return { session: data?.session ?? null, error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=reset`,
    });
    return { error };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setCompanyId(null);
    setCompanyUserId(null);
    setPermissions([]);
    setLicense(null);
    setIsSuperadmin(false);
    setUser(null);
    setSession(null);
  };

  const value = {
    user,
    session,
    companyId,
    companyUserId,
    license,
    permissions,
    isSuperadmin,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    refreshPermissions: () => refreshPermissions(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};