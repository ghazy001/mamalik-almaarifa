-- Hand-authored guards accompany the generated schema. Owners remain trusted.
REVOKE ALL ON SCHEMA content FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA content FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION content.guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Question revisions cannot be deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'New revisions must be drafts';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.question_id, NEW.revision, NEW.content, NEW.author, NEW.created_at)
      IS DISTINCT FROM (OLD.question_id, OLD.revision, OLD.content, OLD.author, OLD.created_at) THEN
    RAISE EXCEPTION 'Create a new revision to change question content';
  END IF;
  IF NOT ((OLD.status = 'DRAFT' AND NEW.status = 'APPROVED')
      OR (OLD.status = 'APPROVED' AND NEW.status = 'PUBLISHED')
      OR (OLD.status = 'PUBLISHED' AND NEW.status = 'RETIRED')) THEN
    RAISE EXCEPTION 'Illegal question revision transition';
  END IF;
  IF OLD.status <> 'DRAFT' AND (NEW.reviewer, NEW.review_note, NEW.reviewed_at)
      IS DISTINCT FROM (OLD.reviewer, OLD.review_note, OLD.reviewed_at) THEN
    RAISE EXCEPTION 'Review evidence is immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER guard_revision BEFORE INSERT OR UPDATE OR DELETE ON content.question_revisions
  FOR EACH ROW EXECUTE FUNCTION content.guard_revision();
--> statement-breakpoint
CREATE FUNCTION content.guard_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Question audit is append-only';
END $$;
--> statement-breakpoint
CREATE TRIGGER guard_audit BEFORE UPDATE OR DELETE ON content.question_audit
  FOR EACH ROW EXECUTE FUNCTION content.guard_audit();
