-- Grant permissions for manual_sections table
GRANT ALL ON TABLE "public"."manual_sections" TO "authenticated", "service_role";
GRANT SELECT ON TABLE "public"."manual_sections" TO "anon";
