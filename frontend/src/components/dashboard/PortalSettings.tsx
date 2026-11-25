import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PortalUsersList } from "./PortalUsersList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Globe, ExternalLink, Copy, Check, Loader2, Upload, X, Image as ImageIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useDropzone } from "react-dropzone";

interface PortalSettingsProps {
  onUpdate?: () => void;
}

interface PortalData {
  company_slug: string | null;
  portal_enabled: boolean;
  portal_description: string | null;
  logo_url: string | null;
  portal_primary_color: string | null;
  portal_background_color: string | null;
  portal_privacy: 'public' | 'private';
}

export function PortalSettings({ onUpdate }: PortalSettingsProps) {
  const { user, companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [portalData, setPortalData] = useState<PortalData>({
    company_slug: null,
    portal_enabled: false,
    portal_description: null,
    logo_url: null,
    portal_primary_color: null,
    portal_background_color: null,
    portal_privacy: 'public',
  });
  const [slugError, setSlugError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    async function fetchPortalSettings() {
      if (!companyId) return;

      try {
        const { data, error } = await supabase
          .from("companies")
          .select("slug, portal_enabled, portal_description, logo_url, portal_primary_color, portal_background_color, portal_privacy")
          .eq("id", companyId)
          .single();

        if (error) {
          console.error("Error fetching portal settings:", error);
          return;
        }

        if (data) {
          setPortalData({
            company_slug: data.slug,
            portal_enabled: data.portal_enabled,
            portal_description: data.portal_description,
            logo_url: data.logo_url,
            portal_primary_color: data.portal_primary_color,
            portal_background_color: data.portal_background_color,
            portal_privacy: (data.portal_privacy as 'public' | 'private') || 'public',
          });
        }
      } catch (err) {
        console.error("Unexpected error fetching settings:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchPortalSettings();
  }, [companyId]);

  const validateSlug = (slug: string): boolean => {
    if (!slug || slug.length < 3) {
      setSlugError("Slug must be at least 3 characters");
      return false;
    }
    if (slug.length > 50) {
      setSlugError("Slug must be less than 50 characters");
      return false;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setSlugError("Only lowercase letters, numbers, and hyphens allowed");
      return false;
    }
    if (slug.startsWith("-") || slug.endsWith("-")) {
      setSlugError("Slug cannot start or end with a hyphen");
      return false;
    }
    setSlugError(null);
    return true;
  };

  const handleSlugChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setPortalData((prev) => ({ ...prev, company_slug: sanitized }));
    if (sanitized) {
      validateSlug(sanitized);
    } else {
      setSlugError(null);
    }
  };

  const handleSave = async () => {
    if (!companyId) return;

    if (portalData.company_slug && !validateSlug(portalData.company_slug)) {
      return;
    }

    setSaving(true);

    try {
      // Check if slug is unique (if changed)
      if (portalData.company_slug) {
        const { data: existing } = await supabase
          .from("companies")
          .select("id")
          .eq("slug", portalData.company_slug)
          .neq("id", companyId)
          .maybeSingle();

        if (existing) {
          setSlugError("This URL is already taken");
          setSaving(false);
          return;
        }
      }

      const { error } = await supabase
        .from("companies")
        .update({
          slug: portalData.company_slug,
          portal_enabled: portalData.portal_enabled,
          portal_description: portalData.portal_description?.slice(0, 500) || null,
          logo_url: portalData.logo_url,
          portal_primary_color: portalData.portal_primary_color,
          portal_background_color: portalData.portal_background_color,
          portal_privacy: portalData.portal_privacy,
        })
        .eq("id", companyId);

      if (error) {
        console.error("Error saving portal settings:", error);
        toast.error("Failed to save settings");
        return;
      }

      toast.success("Portal settings saved");
      onUpdate?.();
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePortal = async (enabled: boolean) => {
    setPortalData((prev) => ({ ...prev, portal_enabled: enabled }));
  };

  const onLogoDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!user || acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be smaller than 2MB");
      return;
    }

    setUploadingLogo(true);

    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/logo.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error("Error uploading logo:", uploadError);
        toast.error("Failed to upload logo");
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("company-logos")
        .getPublicUrl(filePath);

      setPortalData((prev) => ({ ...prev, logo_url: publicUrl }));
      toast.success("Logo uploaded! Don't forget to save settings.");
    } catch (err) {
      console.error("Unexpected error uploading logo:", err);
      toast.error("An unexpected error occurred");
    } finally {
      setUploadingLogo(false);
    }
  }, [user]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onLogoDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"] },
    maxFiles: 1,
    disabled: uploadingLogo,
  });

  const handleRemoveLogo = () => {
    setPortalData((prev) => ({ ...prev, logo_url: null }));
  };

  const portalUrl = portalData.company_slug
    ? `${window.location.origin}/company/${portalData.company_slug}`
    : null;

  const handleCopyLink = async () => {
    if (!portalUrl) return;

    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      toast.success("Portal link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handlePreview = () => {
    if (portalUrl) {
      window.open(portalUrl, "_blank");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Company Portal</CardTitle>
            <CardDescription>
              Share all your public manuals through a single link
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="portal-toggle">Enable Portal</Label>
            <p className="text-sm text-muted-foreground">
              Make your company portal accessible to anyone with the link
            </p>
          </div>
          <Switch
            id="portal-toggle"
            checked={portalData.portal_enabled}
            onCheckedChange={handleTogglePortal}
          />
        </div>

        {/* Portal Privacy */}
        <div className="space-y-3">
          <Label>Portal Access</Label>
          <div className={`space-y-2 ${!portalData.portal_enabled ? 'opacity-50' : ''}`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="portal_privacy"
                value="public"
                checked={portalData.portal_privacy === 'public'}
                onChange={() => setPortalData(prev => ({ ...prev, portal_privacy: 'public' }))}
                disabled={!portalData.portal_enabled}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">Public</span>
                <p className="text-xs text-muted-foreground">Anyone with the link can access the portal</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="portal_privacy"
                value="private"
                checked={portalData.portal_privacy === 'private'}
                onChange={() => setPortalData(prev => ({ ...prev, portal_privacy: 'private' }))}
                disabled={!portalData.portal_enabled}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">Private</span>
                <p className="text-xs text-muted-foreground">Only invited users can access the portal</p>
              </div>
            </label>
          </div>
        </div>

        {/* Company Slug */}
        <div className="space-y-2">
          <Label htmlFor="company-slug">Portal URL</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="flex items-center">
                <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0 border-input">
                  {window.location.origin}/company/
                </span>
                <Input
                  id="company-slug"
                  value={portalData.company_slug || ""}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="your-company"
                  className="rounded-l-none"
                />
              </div>
              {slugError && (
                <p className="text-sm text-destructive mt-1">{slugError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Company Logo */}
        <div className="space-y-2">
          <Label>Company Logo</Label>
          {portalData.logo_url ? (
            <div className="flex items-center gap-4">
              <div className="relative">
                <img
                  src={portalData.logo_url}
                  alt="Company logo"
                  className="h-16 w-16 rounded-lg object-contain border border-border bg-muted"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={handleRemoveLogo}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Logo will appear on your portal header
              </p>
            </div>
          ) : (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
                }`}
            >
              <input {...getInputProps()} />
              {uploadingLogo ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm">Uploading...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {isDragActive
                      ? "Drop logo here..."
                      : "Drop logo here or click to upload"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, GIF up to 2MB
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Portal Description */}
        <div className="space-y-2">
          <Label htmlFor="portal-description">Portal Description</Label>
          <Textarea
            id="portal-description"
            value={portalData.portal_description || ""}
            onChange={(e) =>
              setPortalData((prev) => ({
                ...prev,
                portal_description: e.target.value,
              }))
            }
            placeholder="Describe your company or documentation..."
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            {(portalData.portal_description?.length || 0)}/500 characters
          </p>
        </div>

        {/* Theme Colors */}
        <div className="space-y-4">
          <Label>Portal Theme</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primary-color" className="text-sm font-normal text-muted-foreground">
                Primary Color
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="primary-color"
                  value={portalData.portal_primary_color || "#3b82f6"}
                  onChange={(e) =>
                    setPortalData((prev) => ({
                      ...prev,
                      portal_primary_color: e.target.value,
                    }))
                  }
                  className="h-10 w-14 rounded-md border border-input cursor-pointer"
                />
                <Input
                  value={portalData.portal_primary_color || "#3b82f6"}
                  onChange={(e) =>
                    setPortalData((prev) => ({
                      ...prev,
                      portal_primary_color: e.target.value,
                    }))
                  }
                  placeholder="#3b82f6"
                  className="flex-1"
                />
                {portalData.portal_primary_color && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setPortalData((prev) => ({
                        ...prev,
                        portal_primary_color: null,
                      }))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bg-color" className="text-sm font-normal text-muted-foreground">
                Background Color
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="bg-color"
                  value={portalData.portal_background_color || "#ffffff"}
                  onChange={(e) =>
                    setPortalData((prev) => ({
                      ...prev,
                      portal_background_color: e.target.value,
                    }))
                  }
                  className="h-10 w-14 rounded-md border border-input cursor-pointer"
                />
                <Input
                  value={portalData.portal_background_color || "#ffffff"}
                  onChange={(e) =>
                    setPortalData((prev) => ({
                      ...prev,
                      portal_background_color: e.target.value,
                    }))
                  }
                  placeholder="#ffffff"
                  className="flex-1"
                />
                {portalData.portal_background_color && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setPortalData((prev) => ({
                        ...prev,
                        portal_background_color: null,
                      }))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Customize your portal colors to match your brand. Leave empty for default theme.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving || !!slugError}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Settings
          </Button>

          {portalData.portal_enabled && portalUrl && (
            <>
              <Button variant="outline" onClick={handleCopyLink}>
                {copied ? (
                  <Check className="h-4 w-4 mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                Copy Link
              </Button>
              <Button variant="outline" onClick={handlePreview}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Preview Portal
              </Button>
            </>
          )}
        </div>

        {/* Status Message */}
        {portalData.portal_enabled && portalUrl && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <p className="text-sm text-foreground">
              Your portal is live at:{" "}
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                {portalUrl}
              </a>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {portalData.portal_privacy === 'private'
                ? 'Only invited portal users can access this portal.'
                : 'Only manuals marked as "public" will appear on your portal.'}
            </p>
          </div>
        )}

        {!portalData.portal_enabled && (
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              Enable your portal to share all public manuals through a single link.
            </p>
          </div>
        )}

        {portalData.portal_enabled && portalData.portal_privacy === 'private' && companyId && (
          <>
            <Separator className="my-6" />
            <PortalUsersList companyId={companyId} />
          </>
        )}
      </CardContent>
    </Card>
  </>
  );
}
