import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { PortalSettings } from '@/components/dashboard/PortalSettings';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const PortalEdit = () => {
    const { user, loading } = useAuth();
    const { canEditPortal } = usePermissions();
    const navigate = useNavigate();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                navigate('/auth');
            } else if (!canEditPortal) {
                navigate('/dashboard');
                toast.error("You don't have permission to edit the portal settings.");
            }
        }
    }, [user, loading, canEditPortal, navigate]);

    if (loading || !user || !canEditPortal) {
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
                        <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground shrink-0">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="text-sm hidden sm:inline">Dashboard</span>
                        </Link>
                        <div className="h-4 w-px bg-border shrink-0" />
                        <div className="flex items-center gap-2 min-w-0">
                            <Globe className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
                            <span className="font-display text-lg sm:text-xl font-medium truncate">Portal Settings</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container py-8">
                <div className="max-w-4xl mx-auto">
                    <PortalSettings />
                </div>
            </main>
        </div>
    );
};

export default PortalEdit;
