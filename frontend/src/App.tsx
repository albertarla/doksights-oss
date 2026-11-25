import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import PortalEdit from "./pages/PortalEdit";
import ManualsManagement from "./pages/ManualsManagement";
import Analytics from "./pages/Analytics";
import InternalManualViewer from "./pages/InternalManualViewer";
import CompanyPortal from "./pages/CompanyPortal";
import CompanyPortalLogin from "./pages/CompanyPortalLogin";
import CompanyUsers from "./pages/CompanyUsers";
import NotFound from "./pages/NotFound";
import Superadmin from "./pages/Superadmin";
import DocBuilder from "./pages/DocBuilder";

const queryClient = new QueryClient();

function DashboardRoute({ children }: { children: React.ReactNode }) {
  const { companyUserId, isSuperadmin, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Block users without workspace permissions and show the UI right here
  if (!companyUserId && !isSuperadmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-4">
          <h1 className="text-xl font-semibold text-foreground">No dashboard access</h1>
          <p className="text-sm text-muted-foreground">
            Your account is not associated with a platform workspace. Visit the company portal you were invited to or sign out.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              // 1. Clear the session FIRST to break the loop
              await signOut();
              // 2. Safely bounce to home once they are a guest
              window.location.href = "/";
            }}
            className="w-full sm:w-auto"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out & Go to homepage
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<DashboardRoute><Dashboard /></DashboardRoute>} />
            <Route path="/dashboard/portal" element={<DashboardRoute><PortalEdit /></DashboardRoute>} />
            <Route path="/dashboard/manuals" element={<DashboardRoute><ManualsManagement /></DashboardRoute>} />
            <Route path="/dashboard/users" element={<DashboardRoute><CompanyUsers /></DashboardRoute>} />
            <Route path="/analytics" element={<DashboardRoute><Analytics /></DashboardRoute>} />
            <Route path="/superadmin" element={<DashboardRoute><Superadmin /></DashboardRoute>} />
            <Route path="/manual/:id" element={<DashboardRoute><InternalManualViewer /></DashboardRoute>} />
            <Route path="/manuals/:id/edit" element={<DashboardRoute><DocBuilder /></DashboardRoute>} />
            <Route path="/company/:companySlug/login" element={<CompanyPortalLogin />} />
            <Route path="/company/:companySlug" element={<CompanyPortal />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;