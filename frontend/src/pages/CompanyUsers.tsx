import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, Copy, RefreshCcw, UserPlus, Users } from "lucide-react";

type PermissionKey = "page.portal" | "page.manuals" | "page.analytics" | "page.users";

const PERMISSION_OPTIONS: { key: PermissionKey; label: string; description: string }[] = [
  { key: "page.portal", label: "Portal Settings", description: "Edit company portal information (logo, colors, slug)." },
  { key: "page.manuals", label: "Documents & Folders", description: "Edit documents and organize folder structure." },
  { key: "page.analytics", label: "Analytics", description: "Access analytics dashboards." },
  { key: "page.users", label: "User Management", description: "Invite and manage company users." },
];

const PERMISSION_LABELS = PERMISSION_OPTIONS.reduce<Record<PermissionKey, string>>((acc, permission) => {
  acc[permission.key] = permission.label;
  return acc;
}, {} as Record<PermissionKey, string>);

interface CompanyUserRow {
  id: string;
  user_id: string;
  status: string;
  role: string;
  created_at: string;
}

interface MemberRow {
  id: string;
  userId: string;
  email: string;
  status: string;
  role: string;
  permissions: PermissionKey[];
  createdAt: string;
}

interface InviteRow {
  id: string;
  email: string;
  permission_keys: PermissionKey[];
  token: string;
  accepted_at: string | null;
  created_at: string;
}

const CompanyUsers = () => {
  const { user, loading, companyId, license } = useAuth();
  const { canManageUsers } = usePermissions();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState<string>("Company");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermissions, setInvitePermissions] = useState<PermissionKey[]>(["page.manuals"]);
  const [isInviting, setIsInviting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<PermissionKey[]>([]);
  const [editingRole, setEditingRole] = useState<string>("member");
  const [inviteSuccessOpen, setInviteSuccessOpen] = useState(false);
  const [justCreatedInviteToken, setJustCreatedInviteToken] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate("/auth");
      } else if (!canManageUsers) {
        navigate("/dashboard");
        toast.error("You don't have permission to manage users.");
      }
    }
  }, [user, loading, navigate, canManageUsers]);

  const memberCount = members.length;
  const activeCount = members.filter((m) => m.status === "active").length;
  const pendingInvites = invites.filter((i) => !i.accepted_at).length;
  const isCurrentUserAdmin = useMemo(() => {
    return members.find(m => m.userId === user?.id)?.role === "admin";
  }, [members, user]);

  const totalUsersCount = memberCount + pendingInvites;
  const isLimitReached = license ? totalUsersCount >= license.max_users : false;

  const fetchCompanyName = useCallback(async () => {
    if (!companyId) return;
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .maybeSingle();

    if (company?.name) {
      setCompanyName(company.name);
    }
  }, [companyId]);

  const fetchMembers = useCallback(
    async (companyIdValue: string) => {
      const { data: companyUsers, error: companyUsersError } = await supabase
        .from("company_users")
        .select("id, user_id, status, role, created_at")
        .eq("company_id", companyIdValue)
        .order("created_at", { ascending: true });

      if (companyUsersError) {
        console.error("Error loading members:", companyUsersError);
        toast.error("Unable to load company members.");
        return;
      }

      const typedUsers = (companyUsers || []) as CompanyUserRow[];
      const userIds = typedUsers.map((member) => member.user_id);
      const memberIds = typedUsers.map((member) => member.id);

      if (typedUsers.length === 0) {
        setMembers([]);
        return;
      }

      const [profileResult, permissionResult] = await Promise.all([
        supabase.from("profiles").select("id, email").in("id", userIds),
        supabase
          .from("company_user_permissions")
          .select("company_user_id, permission_key")
          .in("company_user_id", memberIds),
      ]);

      if (profileResult.error) {
        console.error("Error loading profiles:", profileResult.error);
      }
      if (permissionResult.error) {
        console.error("Error loading permissions:", permissionResult.error);
      }

      const profilesById = new Map(
        (profileResult.data || []).map((profile) => [profile.id, profile.email])
      );
      const permissionsByMember = new Map<string, PermissionKey[]>();

      (permissionResult.data || []).forEach((permission) => {
        const list = permissionsByMember.get(permission.company_user_id) || [];
        list.push(permission.permission_key as PermissionKey);
        permissionsByMember.set(permission.company_user_id, list);
      });

      const formattedMembers: MemberRow[] = typedUsers.map((member) => ({
        id: member.id,
        userId: member.user_id,
        email: profilesById.get(member.user_id) || member.user_id,
        status: member.status,
        role: member.role,
        permissions: permissionsByMember.get(member.id) || [],
        createdAt: member.created_at,
      }));

      setMembers(formattedMembers);
    },
    []
  );

  const fetchInvites = useCallback(async (companyIdValue: string) => {
    const { data: inviteData, error } = await supabase
      .from("company_invites")
      .select("id, email, token, accepted_at, created_at")
      .eq("company_id", companyIdValue)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading invites:", error);
      toast.error("Unable to load invites.");
      return;
    }

    if (!inviteData || inviteData.length === 0) {
      setInvites([]);
      return;
    }

    const inviteIds = inviteData.map((invite) => invite.id);
    const { data: permissionRows, error: permissionError } = await supabase
      .from("company_invite_permissions")
      .select("invite_id, permission_key")
      .in("invite_id", inviteIds);

    if (permissionError) {
      console.error("Error loading invite permissions:", permissionError);
    }

    const permissionsByInvite = new Map<string, PermissionKey[]>();
    (permissionRows || []).forEach((permission) => {
      const list = permissionsByInvite.get(permission.invite_id) || [];
      list.push(permission.permission_key as PermissionKey);
      permissionsByInvite.set(permission.invite_id, list);
    });

    const formattedInvites: InviteRow[] = inviteData.map((invite) => ({
      ...invite,
      permission_keys: permissionsByInvite.get(invite.id) || [],
    }));

    setInvites(formattedInvites);
  }, []);

  const refreshData = useCallback(async () => {
    if (!companyId || !canManageUsers) return;
    setIsLoading(true);

    await Promise.all([
      fetchCompanyName(),
      fetchMembers(companyId),
      fetchInvites(companyId)
    ]);

    setIsLoading(false);
  }, [companyId, canManageUsers, fetchCompanyName, fetchMembers, fetchInvites]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const togglePermission = (
    permission: PermissionKey,
    setPermissions: (permissions: PermissionKey[]) => void,
    permissions: PermissionKey[]
  ) => {
    if (permissions.includes(permission)) {
      setPermissions(permissions.filter((p) => p !== permission));
    } else {
      setPermissions([...permissions, permission]);
    }
  };

  const handleInvite = async () => {
    if (!companyId) return;
    const trimmedEmail = inviteEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error("Enter an email address.");
      return;
    }
    if (invitePermissions.length === 0) {
      toast.error("Select at least one permission.");
      return;
    }

    setIsInviting(true);
    const token = crypto.randomUUID();

    const { data: invite, error } = await supabase
      .from("company_invites")
      .insert({
        company_id: companyId,
        email: trimmedEmail,
        token,
      })
      .select("id")
      .single();

    if (error || !invite) {
      console.error("Error creating invite:", error);
      toast.error("Unable to create invite.");
      setIsInviting(false);
      return;
    }

    const { error: permissionError } = await supabase.from("company_invite_permissions").insert(
      invitePermissions.map((permission) => ({
        invite_id: invite.id,
        permission_key: permission,
      }))
    );

    if (permissionError) {
      console.error("Error assigning invite permissions:", permissionError);
      toast.error("Invite created, but permissions failed.");
      setIsInviting(false);
      return;
    }

    setJustCreatedInviteToken(token);
    setInviteSuccessOpen(true);
    setInviteEmail("");
    setInvitePermissions(["page.manuals"]);
    toast.success("Invite created.");
    await fetchInvites(companyId);
    setIsInviting(false);
  };

  const handleCopyInvite = async (token: string) => {
    const inviteUrl = `${window.location.origin}/auth?invite=${token}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied.");
    } catch {
      toast.error("Unable to copy invite link.");
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!companyId) return;
    const { error } = await supabase.from("company_invites").delete().eq("id", inviteId);
    if (error) {
      console.error("Error revoking invite:", error);
      toast.error("Unable to revoke invite.");
      return;
    }
    toast.success("Invite revoked.");
    await fetchInvites(companyId);
  };

  const handleRemoveMember = async (member: MemberRow) => {
    if (!companyId) return;
    if (member.userId === user?.id) {
      toast.error("You cannot remove your own access.");
      return;
    }

    if (!confirm(`Are you sure you want to remove ${member.email}? This action is permanent.`)) {
      return;
    }

    const { error } = await supabase.rpc("delete_user", {
      target_user_id: member.userId,
    });

    if (error) {
      console.error("Error removing member:", error);
      toast.error("Unable to remove member.");
      return;
    }

    toast.success("User removed.");
    await fetchMembers(companyId);
  };

  const openEditPermissions = (member: MemberRow) => {
    setEditingMember(member);
    setEditingPermissions(member.permissions);
    setEditingRole(member.role);
    setEditOpen(true);
  };

  const savePermissions = async () => {
    if (!companyId || !editingMember) return;
    if (editingPermissions.length === 0) {
      toast.error("Select at least one permission.");
      return;
    }

    const existing = new Set(editingMember.permissions);
    const next = new Set(editingPermissions);
    const toAdd = editingPermissions.filter((permission) => !existing.has(permission));
    const toRemove = editingMember.permissions.filter((permission) => !next.has(permission));

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("company_user_permissions")
        .delete()
        .eq("company_user_id", editingMember.id)
        .in("permission_key", toRemove);
      if (error) {
        console.error("Error removing permissions:", error);
        toast.error("Unable to update permissions.");
        return;
      }
    }

    if (toAdd.length > 0) {
      const { error } = await supabase
        .from("company_user_permissions")
        .insert(
          toAdd.map((permission) => ({
            company_user_id: editingMember.id,
            permission_key: permission,
          }))
        );
      if (error) {
        console.error("Error adding permissions:", error);
        toast.error("Unable to update permissions.");
        return;
      }
    }

    if (editingRole !== editingMember.role) {
      const { error: roleError } = await supabase.rpc("update_user_role", {
        target_company_user_id: editingMember.id,
        new_role: editingRole,
      });

      if (roleError) {
        console.error("Error updating role:", roleError);
        toast.error(`Unable to update role: ${roleError.message}`);
        // Allow it to fall through to refresh anyway so permissions stick
      }
    }

    toast.success("Permissions updated.");
    setEditOpen(false);
    await fetchMembers(companyId);
  };

  const sortedPermissionLabels = useCallback((permissions: PermissionKey[]) => {
    return permissions
      .slice()
      .sort((a, b) => PERMISSION_LABELS[a].localeCompare(PERMISSION_LABELS[b]))
      .map((permission) => PERMISSION_LABELS[permission] ?? permission);
  }, []);

  const memberRows = useMemo(() => {
    return members.map((member) => ({
      ...member,
      permissionLabels: sortedPermissionLabels(member.permissions),
    }));
  }, [members, sortedPermissionLabels]);

  if (loading || !user) {
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
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
              <span className="font-display text-lg sm:text-xl font-medium truncate">Users</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={refreshData} className="shrink-0 ml-2">
            <RefreshCcw className="sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        <div>
          <h1 className="font-display text-3xl font-medium">{companyName}</h1>
          <p className="mt-2 text-muted-foreground">
            Invite teammates and assign page permissions. Removing a user deletes them permanently from the system.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Total Members</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{memberCount}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Active Members</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{activeCount}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Pending Invites</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{pendingInvites}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5" /> Invite Users
            </CardTitle>
            <CardDescription>Send an invite by email and select one or more permissions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLimitReached && (
              <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
                You have reached the maximum number of users ({license?.max_users}) for your current license plan.
                Ask your instance admin to raise the limit.
              </div>
            )}
            <div className={`grid gap-4 sm:grid-cols-[1.5fr_2fr] ${isLimitReached ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  placeholder="name@company.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Permissions</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PERMISSION_OPTIONS.map((permission) => (
                    <label
                      key={permission.key}
                      className="flex items-start gap-2 rounded-md border border-border p-2"
                    >
                      <Checkbox
                        checked={invitePermissions.includes(permission.key)}
                        onCheckedChange={() =>
                          togglePermission(permission.key, setInvitePermissions, invitePermissions)
                        }
                      />
                      <div className="text-sm">
                        <p className="font-medium">{permission.label}</p>
                        <p className="text-xs text-muted-foreground">{permission.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <Button onClick={handleInvite} disabled={isInviting || !companyId || isLimitReached}>
              {isInviting ? "Creating invite..." : "Create Invite"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Members</CardTitle>
            <CardDescription>Manage permissions and status for active users.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memberRows.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.email}</TableCell>
                      <TableCell>
                        <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.status === "active" ? "default" : "secondary"}>
                          {member.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {member.permissionLabels.length > 0 ? (
                            member.permissionLabels.map((permission) => (
                              <Badge key={permission} variant="outline">
                                {permission}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">No permissions</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openEditPermissions(member)}>
                          Edit Permissions
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemoveMember(member)}
                          disabled={member.userId === user.id || (!isCurrentUserAdmin && member.role === "admin")}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {memberRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No members found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invites</CardTitle>
            <CardDescription>Track pending invites and copy links.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => {
                  const isAccepted = Boolean(invite.accepted_at);
                  const statusLabel = isAccepted ? "accepted" : "pending";
                  return (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {invite.permission_keys.map((permission) => (
                            <Badge key={permission} variant="outline">
                              {PERMISSION_LABELS[permission] ?? permission}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isAccepted ? "default" : "secondary"}>{statusLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {!isAccepted && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleCopyInvite(invite.token)}>
                              <Copy className="mr-2 h-3 w-3" />
                              Copy
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleRevokeInvite(invite.id)}>
                              Revoke
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {invites.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No invites yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Permissions</DialogTitle>
            <DialogDescription>
              Assign one or more permissions to this user. Permissions are enforced in the database.
            </DialogDescription>
          </DialogHeader>
          {editingMember && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">{editingMember.email}</div>
              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>User Role</Label>
                  <Select
                    value={editingRole}
                    onValueChange={setEditingRole}
                    disabled={!isCurrentUserAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                  {!isCurrentUserAdmin && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Only admins can change roles.
                    </p>
                  )}
                </div>
              </div>

              <Separator />
              <div className="grid gap-2 sm:grid-cols-2">
                {PERMISSION_OPTIONS.map((permission) => (
                  <label
                    key={permission.key}
                    className="flex items-start gap-2 rounded-md border border-border p-2"
                  >
                    <Checkbox
                      checked={editingPermissions.includes(permission.key)}
                      onCheckedChange={() =>
                        togglePermission(permission.key, setEditingPermissions, editingPermissions)
                      }
                    />
                    <div className="text-sm">
                      <p className="font-medium">{permission.label}</p>
                      <p className="text-xs text-muted-foreground">{permission.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={savePermissions}>Save Permissions</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={inviteSuccessOpen} onOpenChange={setInviteSuccessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Link Generated</DialogTitle>
            <DialogDescription>
              Share this link with the user to let them join your company.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 py-4">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="link" className="sr-only">
                Link
              </Label>
              <Input
                id="link"
                defaultValue={
                  justCreatedInviteToken
                    ? `${window.location.origin}/auth?invite=${justCreatedInviteToken}`
                    : ""
                }
                readOnly
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="px-3"
              onClick={() => {
                if (justCreatedInviteToken) {
                  handleCopyInvite(justCreatedInviteToken);
                }
              }}
            >
              <span className="sr-only">Copy</span>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setInviteSuccessOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CompanyUsers;