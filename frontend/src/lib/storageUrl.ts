/**
 * Signed storage URLs are built by the Edge Function from its own SUPABASE_URL.
 * On hosted Supabase that is the public project URL, but in local development the
 * function runs inside Docker and returns an internal host (e.g. http://kong:8000)
 * that the browser cannot reach. Point any storage URL at the public URL the
 * frontend already uses. On hosted projects the origins match and nothing changes.
 */
export function toPublicStorageUrl(url: string | null | undefined, publicBase = import.meta.env.VITE_SUPABASE_URL): string | null | undefined {
  if (!url || !publicBase) return url;
  try {
    const parsed = new URL(url);
    const base = new URL(publicBase);
    if (parsed.origin === base.origin || !parsed.pathname.startsWith('/storage/v1/')) return url;
    return `${base.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
