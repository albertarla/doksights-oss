import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigate } from "react-router-dom";
import { BookOpen, LogOut, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompaniesTab } from "@/components/superadmin/CompaniesTab";
import { LicensesTab } from "@/components/superadmin/LicensesTab";
import { Database } from "@/integrations/supabase/types";

export type Company = Database["public"]["Tables"]["companies"]["Row"] & {
  manualsCount: number;
  usersCount: number;
  licenseId: string | null;
  licenseName: string;
};

export default function Superadmin() {
  const { user, isSuperadmin, loading } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    if (!isSuperadmin) return;

    setIsLoading(true);
    try {
      const { data: companiesData, error: companiesError } = await supabase
        .from("companies")
        .select(`
          *,
          company_licenses (
            licenses (
              id,
              name
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (companiesError) throw companiesError;

      const enhancedCompanies = await Promise.all(
        (companiesData || []).map(async (company) => {
          const { count: manualsCount } = await supabase
            .from("manuals")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id);

          const { count: usersCount } = await supabase
            .from("company_users")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id);

          return {
            ...company,
            manualsCount: manualsCount || 0,
            usersCount: usersCount || 0,
            licenseId: (company.company_licenses as any)?.licenses?.id || null,
            licenseName: (company.company_licenses as any)?.licenses?.name || "None",
          };
        })
      );

      setCompanies(enhancedCompanies);
    } catch (error) {
      console.error("Error loading superadmin data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) {
      loadData();
    }
  }, [isSuperadmin, loading]);

  if (loading) return null;

  if (!user || !isSuperadmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const totalUsers = companies.reduce((acc, c) => acc + c.usersCount, 0);
  const totalManuals = companies.reduce((acc, c) => acc + c.manualsCount, 0);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="h-6 w-6 text-primary shrink-0" />
            <span className="font-display text-lg sm:text-xl font-medium truncate">Superadmin</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <Button variant="ghost" size="sm" asChild className="px-2 sm:px-3">
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="px-2 sm:px-3">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Superadmin Dashboard</h1>
          <p className="text-muted-foreground">Manage all tenants and system-wide settings.</p>
        </div>

        {isLoading ? (
          <div>Loading system data...</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{companies.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalUsers}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalManuals}</div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="companies" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="companies">Companies</TabsTrigger>
                <TabsTrigger value="licenses">Licenses Configurations</TabsTrigger>
              </TabsList>

              <TabsContent value="companies" className="mt-0">
                <CompaniesTab companies={companies} isLoading={isLoading} onRefresh={loadData} />
              </TabsContent>

              <TabsContent value="licenses" className="mt-0">
                <Card>
                  <CardContent className="pt-6">
                    <LicensesTab />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
