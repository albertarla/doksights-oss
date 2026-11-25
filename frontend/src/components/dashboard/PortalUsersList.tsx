import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CHAT_API_CONFIG } from "@/config/chatApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Trash2, Mail } from "lucide-react";

interface Props {
  companyId: string;
}

interface PortalUser {
  id: string;
  email: string;
  created_at: string;
}

interface PendingInvite {
  id: string;
  email: string;
  expires_at: string;
  created_at: string;
}

export function PortalUsersList({ companyId }: Props) {
  const { session } = useAuth();
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [companyInfo, setCompanyInfo] = useState<{ name: string; slug: string } | null>(null);

  const fetchLists = async () => {
    const [usersResult, invitesResult, companyResult] = await Promise.all([
      supabase
        .from("portal_users")
        .select("id, email, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("portal_invites")
        .select("id, email, expires_at, created_at")
        .eq("company_id", companyId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("companies")
        .select("name, slug")
        .eq("id", companyId)
        .single(),
    ]);

    if (usersResult.data) setPortalUsers(usersResult.data as PortalUser[]);
    if (invitesResult.data) setPendingInvites(invitesResult.data as PendingInvite[]);
    if (companyResult.data) setCompanyInfo(companyResult.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchLists();
  }, [companyId]);

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleInvite = async () => {
    if (!isValidEmail(inviteEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setInviting(true);
    try {
      // Check if profile already exists
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", inviteEmail)
        .maybeSingle();

      if (profile) {
        // Directly add to portal_users
        const { error } = await supabase
          .from("portal_users")
          .insert({ company_id: companyId, user_id: profile.id, email: inviteEmail });

        if (error) {
          toast.error(error.message.includes("duplicate") ? "This user already has access." : error.message);
        } else {
          toast.success("User added directly.");
          setInviteEmail("");
          await fetchLists();
        }
      } else {
        // Insert invite (upsert to handle expired invites for the same email)
        const { data: inviteData, error: inviteError } = await supabase
          .from("portal_invites")
          .upsert(
            {
              company_id: companyId,
              email: inviteEmail,
              created_by: session?.user?.id ?? null,
              token: crypto.randomUUID(),
              accepted_at: null,
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
            { onConflict: "company_id,email" }
          )
          .select("token")
          .single();

        if (inviteError || !inviteData) {
          toast.error(inviteError?.message || "Failed to create invite.");
          return;
        }

        // Send invite email via API
        const response = await fetch(`${CHAT_API_CONFIG.BASE_URL}/portal/send-invite`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            company_id: companyId,
            invite_token: inviteData.token,
            email: inviteEmail,
            company_name: companyInfo?.name ?? "",
            company_slug: companyInfo?.slug ?? "",
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          const errorMsg = errData?.detail || `Status ${response.status}`;
          console.error("Backend error sending invite:", errData);
          toast.warning(`Invite created but email failed (${errorMsg}).`);
        } else {
          toast.success(`Invite sent to ${inviteEmail}.`);
        }

        setInviteEmail("");
        await fetchLists();
      }
    } catch (err) {
      console.error("Invite error:", err);
      toast.error("An unexpected error occurred.");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveUser = async (id: string) => {
    setRemovingId(id);
    try {
      const { error } = await supabase.from("portal_users").delete().eq("id", id);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("User removed.");
        await fetchLists();
      }
    } finally {
      setRemovingId(null);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    setRemovingId(id);
    try {
      const { error } = await supabase.from("portal_invites").delete().eq("id", id);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Invite revoked.");
        await fetchLists();
      }
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Portal Users</h3>
        <p className="text-sm text-muted-foreground">Manage who can access this private portal.</p>
      </div>

      {/* Invite form */}
      <div className="space-y-2">
        <Label htmlFor="invite-email">Invite by Email</Label>
        <div className="flex gap-2">
          <Input
            id="invite-email"
            type="email"
            placeholder="user@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            disabled={inviting}
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          />
          <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
            {inviting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Inviting...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Invite
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Authorized Users */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Authorized Users</h4>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : portalUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No authorized users yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-md border">
            {portalUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(u.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  disabled={removingId === u.id}
                  onClick={() => handleRemoveUser(u.id)}
                  title="Remove user"
                  aria-label="Remove user"
                >
                  {removingId === u.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invitations */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Pending Invitations</h4>
        {loading ? null : pendingInvites.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No pending invitations.</p>
        ) : (
          <div className="divide-y divide-border rounded-md border">
            {pendingInvites.map((inv) => {
              const isExpired = new Date(inv.expires_at) < new Date();
              return (
                <div key={inv.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="text-sm font-medium">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Sent {new Date(inv.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {isExpired && (
                      <Badge variant="destructive" className="text-xs">
                        Expired
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    disabled={removingId === inv.id}
                    onClick={() => handleRevokeInvite(inv.id)}
                    title="Revoke invite"
                    aria-label="Revoke invite"
                  >
                    {removingId === inv.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
