REVOKE ALL ON game.result_participants FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER guard_result_participants BEFORE UPDATE OR DELETE ON game.result_participants
  FOR EACH ROW EXECUTE FUNCTION game.guard_match_result();
--> statement-breakpoint
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON game.result_participants FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
