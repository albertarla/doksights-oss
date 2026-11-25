import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CHAT_API_CONFIG } from "@/config/chatApi";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Edit2 } from "lucide-react";
import { License } from "./LicensesTab";

export interface CompanyWithStats {
  id: string;
  name: string;
  slug: string;
  portal_enabled: boolean;
  created_at: string;
  manualsCount: number;
  usersCount: number;
  licenseId: string | null;
  licenseName: string;
}

export function CompaniesTab({
  companies,
  isLoading,
  onRefresh
}: {
  companies: CompanyWithStats[];
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [isProvisionDialogOpen, setIsProvisionDialogOpen] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [licenses, setLicenses] = useState<License[]>([]);

  // Form State
  const [companyName, setCompanyName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [licenseId, setLicenseId] = useState("");

  const [isEditLicenseDialogOpen, setIsEditLicenseDialogOpen] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState("");
  const [editLicenseId, setEditLicenseId] = useState("");
  const [isUpdatingLicense, setIsUpdatingLicense] = useState(false);

  const fetchLicenses = async () => {
    const { data } = await supabase.from("licenses").select("*").order("name");
    if (data) {
      const list = data as unknown as License[];
      setLicenses(list);
      // Pre-select the default license so self-hosted admins don't have to pick one.
      const defaultLicense = list.find(l => l.name === "Self-hosted") ?? (list.length === 1 ? list[0] : undefined);
      if (defaultLicense) setLicenseId(prev => prev || defaultLicense.id);
    }
  };

  useEffect(() => {
    fetchLicenses();
  }, []);

  const resetForm = () => {
    setCompanyName("");
    setAdminEmail("");
    setAdminPassword("");
    setLicenseId("");
  };

  const handleProvision = async () => {
    if (!companyName || !adminEmail || !adminPassword || !licenseId) {
      toast({ variant: "destructive", title: "Validation Error", description: "All fields are required." });
      return;
    }

    if (!session?.access_token) {
      toast({ variant: "destructive", title: "Auth Error", description: "No active session." });
      return;
    }

    setIsProvisioning(true);

    try {
      const response = await fetch(`${CHAT_API_CONFIG.BASE_URL}/superadmin/companies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          company_name: companyName,
          admin_email: adminEmail,
          admin_password: adminPassword,
          license_id: licenseId
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Provisioning failed");
      }

      toast({ title: "Success", description: "Company and Admin provisioned successfully." });
      setIsProvisionDialogOpen(false);
      resetForm();
      onRefresh(); // Refresh companies list in parent

    } catch (err: any) {
      toast({ variant: "destructive", title: "Provision failed", description: err.message });
    } finally {
      setIsProvisioning(false);
    }
  };

  const openEditLicense = (company: CompanyWithStats) => {
    setEditingCompanyId(company.id);
    setEditLicenseId(company.licenseId || "");
    setIsEditLicenseDialogOpen(true);
  };

  const handleUpdateLicense = async () => {
    if (!editLicenseId) {
      toast({ variant: "destructive", title: "Error", description: "Select a license." });
      return;
    }
    setIsUpdatingLicense(true);
    try {
      const { data: existing } = await supabase.from('company_licenses').select('company_id').eq('company_id', editingCompanyId).maybeSingle();

      let updateError;
      if (existing) {
        const { error } = await supabase.from('company_licenses').update({ license_id: editLicenseId }).eq('company_id', editingCompanyId);
        updateError = error;
      } else {
        const { error } = await supabase.from('company_licenses').insert({ company_id: editingCompanyId, license_id: editLicenseId, subscription_status: 'active' });
        updateError = error;
      }

      if (updateError) throw updateError;
      toast({ title: "Success", description: "License updated successfully." });
      setIsEditLicenseDialogOpen(false);
      onRefresh();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err.message });
    } finally {
      setIsUpdatingLicense(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Tenants (Companies)</h2>
        <Dialog open={isProvisionDialogOpen} onOpenChange={(open) => {
          setIsProvisionDialogOpen(open);
          if (!open) resetForm();
          else fetchLicenses();
        }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Provision Company</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" /> Provision New Company
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Acme Inc." />
              </div>
              <div className="space-y-2">
                <Label>Admin Email</Label>
                <Input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@acme.com" />
              </div>
              <div className="space-y-2">
                <Label>Admin Initial Password</Label>
                <Input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="securepassword" />
              </div>
              <div className="space-y-2">
                <Label>Assign License</Label>
                <Select value={licenseId} onValueChange={setLicenseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a license" />
                  </SelectTrigger>
                  <SelectContent>
                    {licenses.map(lic => (
                      <SelectItem key={lic.id} value={lic.id}>{lic.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleProvision} disabled={isProvisioning} className="w-full">
                {isProvisioning ? "Provisioning..." : "Provision Company"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditLicenseDialogOpen} onOpenChange={setIsEditLicenseDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change License</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Assign New License</Label>
                <Select value={editLicenseId} onValueChange={setEditLicenseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a license" />
                  </SelectTrigger>
                  <SelectContent>
                    {licenses.map(lic => (
                      <SelectItem key={lic.id} value={lic.id}>{lic.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleUpdateLicense} disabled={isUpdatingLicense} className="w-full">
                {isUpdatingLicense ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>License</TableHead>
              <TableHead>Portal Status</TableHead>
              <TableHead className="text-right">Users</TableHead>
              <TableHead className="text-right">Documents</TableHead>
              <TableHead className="text-right">Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">Loading companies...</TableCell>
              </TableRow>
            ) : companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">No companies found.</TableCell>
              </TableRow>
            ) : (
              companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium">{company.name}</TableCell>
                  <TableCell>{company.slug}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                      {company.licenseName}
                    </span>
                  </TableCell>
                  <TableCell>
                    {company.portal_enabled ? (
                      <span className="text-green-600 font-medium">Enabled</span>
                    ) : (
                      <span className="text-muted-foreground">Disabled</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{company.usersCount}</TableCell>
                  <TableCell className="text-right">{company.manualsCount}</TableCell>
                  <TableCell className="text-right">
                    {new Date(company.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEditLicense(company)} title="Change License">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
