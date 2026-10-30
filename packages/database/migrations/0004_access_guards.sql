-- Keep private content outside anonymous/authenticated Data API access.
REVOKE ALL ON ALL TABLES IN SCHEMA content FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA content FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER guard_access_audit BEFORE UPDATE OR DELETE ON content.access_audit
  FOR EACH ROW EXECUTE FUNCTION content.guard_audit();
--> statement-breakpoint
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA content FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA content FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA content FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
