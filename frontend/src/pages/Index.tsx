import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Root route. Self-hosted instances have no marketing page:
 * signed-in users go to their dashboard, everyone else to sign in.
 */
const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <Navigate to={user ? '/dashboard' : '/auth'} replace />;
};

export default Index;
