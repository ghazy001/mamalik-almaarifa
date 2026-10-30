REVOKE ALL ON SCHEMA game FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA game FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA game FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION game.guard_match_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Match archives are immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_match_results BEFORE UPDATE OR DELETE ON game.match_results
  FOR EACH ROW EXECUTE FUNCTION game.guard_match_result();
--> statement-breakpoint
CREATE TRIGGER guard_result_questions BEFORE UPDATE OR DELETE ON game.result_questions
  FOR EACH ROW EXECUTE FUNCTION game.guard_match_result();
--> statement-breakpoint
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA game FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA game FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA game FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
