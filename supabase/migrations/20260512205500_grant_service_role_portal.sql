-- Grant permissions for portal_users and portal_invites to service_role
-- This fixes the 403 Forbidden error when backend attempts to access these tables via Supabase API

GRANT ALL ON TABLE "public"."portal_users" TO "service_role";
GRANT ALL ON TABLE "public"."portal_invites" TO "service_role";
