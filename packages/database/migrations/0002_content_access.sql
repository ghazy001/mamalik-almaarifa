CREATE TYPE "content"."content_role" AS ENUM('editor', 'reviewer', 'publisher');--> statement-breakpoint
CREATE TABLE "content"."access_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"subject" uuid NOT NULL,
	"role" "content"."content_role" NOT NULL,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_access_action" CHECK ("content"."access_audit"."action" IN ('GRANT', 'REVOKE'))
);
--> statement-breakpoint
ALTER TABLE "content"."access_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content"."memberships" (
	"issuer" text NOT NULL,
	"subject" uuid NOT NULL,
	"role" "content"."content_role" NOT NULL,
	CONSTRAINT "memberships_issuer_subject_role_pk" PRIMARY KEY("issuer","subject","role")
);
--> statement-breakpoint
ALTER TABLE "content"."memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content"."question_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content"."questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content"."question_revisions" ENABLE ROW LEVEL SECURITY;