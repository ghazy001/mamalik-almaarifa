CREATE SCHEMA "content";
--> statement-breakpoint
CREATE TYPE "content"."audit_action" AS ENUM('DRAFT_CREATED', 'APPROVED', 'PUBLISHED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "content"."revision_status" AS ENUM('DRAFT', 'APPROVED', 'PUBLISHED', 'RETIRED');--> statement-breakpoint
CREATE TABLE "content"."question_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"question_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" "content"."audit_action" NOT NULL,
	"actor" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content"."questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"latest_revision" integer NOT NULL,
	"import_key" text,
	CONSTRAINT "questions_import_key_unique" UNIQUE("import_key"),
	CONSTRAINT "positive_revision" CHECK ("content"."questions"."latest_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "content"."question_revisions" (
	"question_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"content" jsonb NOT NULL,
	"author" text NOT NULL,
	"status" "content"."revision_status" DEFAULT 'DRAFT' NOT NULL,
	"reviewer" text,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "question_revisions_question_id_revision_pk" PRIMARY KEY("question_id","revision"),
	CONSTRAINT "positive_revision" CHECK ("content"."question_revisions"."revision" > 0),
	CONSTRAINT "review_required" CHECK (("content"."question_revisions"."status" = 'DRAFT' AND "content"."question_revisions"."reviewer" IS NULL AND "content"."question_revisions"."review_note" IS NULL AND "content"."question_revisions"."reviewed_at" IS NULL) OR ("content"."question_revisions"."status" <> 'DRAFT' AND "content"."question_revisions"."reviewer" IS NOT NULL AND "content"."question_revisions"."reviewer" <> "content"."question_revisions"."author" AND "content"."question_revisions"."review_note" IS NOT NULL AND length(trim("content"."question_revisions"."review_note")) > 0 AND "content"."question_revisions"."reviewed_at" IS NOT NULL)),
	CONSTRAINT "content_shape" CHECK ((jsonb_typeof("content"."question_revisions"."content") = 'object' AND "content"."question_revisions"."content"->>'locale' = 'ar' AND jsonb_array_length("content"."question_revisions"."content"->'choices') = 4 AND jsonb_array_length("content"."question_revisions"."content"->'sources') >= 1) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "content"."question_audit" ADD CONSTRAINT "question_audit_question_id_revision_question_revisions_question_id_revision_fk" FOREIGN KEY ("question_id","revision") REFERENCES "content"."question_revisions"("question_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."question_revisions" ADD CONSTRAINT "question_revisions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "content"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_published_revision" ON "content"."question_revisions" USING btree ("question_id") WHERE "content"."question_revisions"."status" = 'PUBLISHED';
