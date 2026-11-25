import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2 } from "lucide-react";

export interface License {
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
  created_at: string;
}

export function LicensesTab() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLicense, setEditingLicense] = useState<License | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [maxManuals, setMaxManuals] = useState(1);
  const [maxPublicManuals, setMaxPublicManuals] = useState(0);
  const [maxUsers, setMaxUsers] = useState(1);
  const [maxAiTokens, setMaxAiTokens] = useState<string>(""); // empty string = unlimited
  const [hasAnalytics, setHasAnalytics] = useState(false);

  const { toast } = useToast();

  const fetchLicenses = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from("licenses").select("*").order("name");
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      setLicenses(data as unknown as License[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchLicenses();
  }, []);

  const resetForm = () => {
    setName("");
    setMaxManuals(1);
    setMaxPublicManuals(0);
    setMaxUsers(1);
    setMaxAiTokens("");
    setHasAnalytics(false);
    setEditingLicense(null);
  };

  const openEditDialog = (license: License) => {
    setEditingLicense(license);
    setName(license.name);
    setMaxManuals(license.max_manuals);
    setMaxPublicManuals(license.max_public_manuals);
    setMaxUsers(license.max_users);
    setMaxAiTokens(license.max_ai_tokens !== null ? String(license.max_ai_tokens) : "");
    setHasAnalytics(!!license.features?.analytics);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    const payload = {
      name,
      max_manuals: maxManuals,
      max_public_manuals: maxPublicManuals,
      max_users: maxUsers,
      max_ai_tokens: maxAiTokens.trim() !== "" ? parseInt(maxAiTokens) || null : null,
      features: { analytics: hasAnalytics },
    };

    if (editingLicense) {
      const { error } = await supabase.from("licenses").update(payload).eq("id", editingLicense.id);
      if (error) {
        toast({ variant: "destructive", title: "Update failed", description: error.message });
        return;
      }
      toast({ title: "Success", description: "License updated successfully." });
    } else {
      const { error } = await supabase.from("licenses").insert(payload);
      if (error) {
        toast({ variant: "destructive", title: "Creation failed", description: error.message });
        return;
      }
      toast({ title: "Success", description: "License created successfully." });
    }

    setIsDialogOpen(false);
    resetForm();
    fetchLicenses();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this license? Companies using it might be affected.")) return;
    const { error } = await supabase.from("licenses").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Deletion failed", description: error.message });
    } else {
      toast({ title: "Success", description: "License deleted." });
      fetchLicenses();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Licenses</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" /> New License</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingLicense ? "Edit License" : "Create License"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>License Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Enterprise" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Documents</Label>
                  <Input type="number" min={1} value={maxManuals} onChange={(e) => setMaxManuals(parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Max Public Documents</Label>
                  <Input type="number" min={0} value={maxPublicManuals} onChange={(e) => setMaxPublicManuals(parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Max Users</Label>
                  <Input type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Max AI Tokens / Month</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Leave empty for unlimited"
                    value={maxAiTokens}
                    onChange={(e) => setMaxAiTokens(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Empty = unlimited</p>
                </div>
              </div>
              <div className="flex items-center justify-between border rounded-md p-4">
                <div className="space-y-0.5">
                  <Label>Analytics Feature</Label>
                  <p className="text-sm text-muted-foreground">Enable advanced analytics</p>
                </div>
                <Switch checked={hasAnalytics} onCheckedChange={setHasAnalytics} />
              </div>
              <Button onClick={handleSave} className="w-full">Save License</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Max Documents (Tot/Pub)</TableHead>
              <TableHead className="text-right">Max Users</TableHead>
              <TableHead className="text-right">Max AI Tokens/mo</TableHead>
              <TableHead>Features</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center">Loading...</TableCell></TableRow>
            ) : licenses.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center">No licenses found.</TableCell></TableRow>
            ) : (
              licenses.map((lic) => (
                <TableRow key={lic.id}>
                  <TableCell className="font-medium">{lic.name}</TableCell>
                  <TableCell className="text-right">{lic.max_manuals} / {lic.max_public_manuals}</TableCell>
                  <TableCell className="text-right">{lic.max_users}</TableCell>
                  <TableCell className="text-right">
                    {lic.max_ai_tokens !== null && lic.max_ai_tokens !== undefined
                      ? lic.max_ai_tokens.toLocaleString()
                      : <span className="text-muted-foreground text-xs">Unlimited</span>}
                  </TableCell>
                  <TableCell>{lic.features?.analytics ? "Analytics" : "None"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(lic)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(lic.id)} className="text-red-500 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
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