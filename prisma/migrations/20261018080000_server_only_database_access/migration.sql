-- The Next.js server owns database access and enforces the application's roles.
-- No browser client (including a Supabase Auth user) may access these tables
-- directly. Keep both grants and RLS restrictive if the Data API is enabled.
DO $$
DECLARE
  table_name text;
  client_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Role', 'User', 'Session', 'LoginAttempt', 'GoogleViewer',
    'GoogleViewerSession', 'PublicExportLog', 'Service', 'AttendanceRecord',
    'GivingRecord', 'Target', 'AuditLog', 'AppSetting', 'ReportMonth',
    'ReportArtifact', 'PasswordReset', 'ManusReportTask',
    'CapitalCampaignEntry', '_prisma_migrations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, client_role);
      END IF;
    END LOOP;
  END LOOP;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
