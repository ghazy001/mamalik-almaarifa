CREATE SCHEMA "game";
--> statement-breakpoint
CREATE TABLE "game"."match_results" (
	"match_id" text PRIMARY KEY NOT NULL,
	"payload_hash" text NOT NULL,
	"archive" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_hash_shape" CHECK ("game"."match_results"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "result_archive_shape" CHECK ((jsonb_typeof("game"."match_results"."archive") = 'object' AND "game"."match_results"."archive"->>'archiveVersion' = '1' AND "game"."match_results"."archive"->>'matchId' = "game"."match_results"."match_id" AND jsonb_array_length("game"."match_results"."archive"->'result'->'placements') = 3) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "game"."match_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game"."result_questions" (
	"match_id" text NOT NULL,
	"position" integer NOT NULL,
	"question_id" text NOT NULL,
	"content_question_id" uuid,
	"content_revision" integer,
	CONSTRAINT "result_questions_match_id_position_pk" PRIMARY KEY("match_id","position"),
	CONSTRAINT "result_question_position" CHECK ("game"."result_questions"."position" >= 0 AND "game"."result_questions"."position" < 120),
	CONSTRAINT "result_question_reference" CHECK (("game"."result_questions"."content_question_id" IS NULL AND "game"."result_questions"."content_revision" IS NULL) OR ("game"."result_questions"."content_question_id" IS NOT NULL AND "game"."result_questions"."content_revision" IS NOT NULL AND "game"."result_questions"."content_revision" > 0 AND "game"."result_questions"."question_id" = "game"."result_questions"."content_question_id"::text || '_v' || "game"."result_questions"."content_revision"::text))
);
--> statement-breakpoint
ALTER TABLE "game"."result_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "game"."result_questions" ADD CONSTRAINT "result_questions_match_id_match_results_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "game"."match_results"("match_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game"."result_questions" ADD CONSTRAINT "result_questions_content_question_id_content_revision_question_revisions_question_id_revision_fk" FOREIGN KEY ("content_question_id","content_revision") REFERENCES "content"."question_revisions"("question_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_question_per_result" ON "game"."result_questions" USING btree ("match_id","question_id");