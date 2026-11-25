import { BookOpen, User, LogOut, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate, useParams } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PortalHeaderProps {
  companyName: string;
  description: string | null;
  totalManuals: number;
  logoUrl?: string | null;
  primaryColor?: string;
}

export function PortalHeader({
  companyName,
  description,
  totalManuals,
  logoUrl,
  primaryColor,
}: PortalHeaderProps) {
  const { user, signOut, companyUserId, isSuperadmin } = useAuth();
  const navigate = useNavigate();
  const { companySlug } = useParams<{ companySlug: string }>();
  const hasCustomPrimary = !!primaryColor;

  const handleLogin = () => {
    navigate(`/company/${companySlug}/login`);
  };

  const handleDashboard = () => {
    navigate("/dashboard");
  };

  const canAccessDashboard = !!companyUserId || isSuperadmin;

  return (
    <header 
      className={hasCustomPrimary ? "bg-primary text-primary-foreground border-b border-primary-foreground/20 shadow-sm" : "bg-card border-b border-border shadow-sm"}
    >
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-start gap-4">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${companyName} logo`}
              className={hasCustomPrimary ? "h-16 w-16 rounded-lg object-contain border border-primary-foreground/20 bg-primary-foreground/10" : "h-16 w-16 rounded-lg object-contain border border-border"}
            />
          ) : (
            <div className={hasCustomPrimary ? "p-3 rounded-lg bg-primary-foreground/20" : "p-3 rounded-lg bg-muted"}>
              <BookOpen className="h-8 w-8" />
            </div>
          )}
          <div className="flex-1">
            <h1 
              className={hasCustomPrimary ? "text-3xl font-bold mb-2" : "text-3xl font-bold text-foreground mb-2"}
            >
              {companyName}
            </h1>
            {description && (
              <p 
                className={hasCustomPrimary ? "max-w-2xl opacity-90" : "text-muted-foreground max-w-2xl"}
              >
                {description}
              </p>
            )}
            <p 
              className={hasCustomPrimary ? "text-sm mt-2 opacity-80" : "text-sm text-muted-foreground mt-2"}
            >
              {totalManuals} {totalManuals === 1 ? "manual" : "manuals"} available
            </p>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant={hasCustomPrimary ? "outline" : "ghost"} 
                    className={hasCustomPrimary ? "bg-primary-foreground/10 hover:bg-primary-foreground/20 border-primary-foreground/20 text-primary-foreground" : ""}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Account
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">Signed in as</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {canAccessDashboard && (
                    <DropdownMenuItem onClick={handleDashboard}>
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      <span>Go to Dashboard</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button 
                onClick={handleLogin}
                variant={hasCustomPrimary ? "outline" : "outline"}
                className={hasCustomPrimary ? "bg-primary-foreground/10 hover:bg-primary-foreground/20 border-primary-foreground/20 text-primary-foreground" : ""}
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
