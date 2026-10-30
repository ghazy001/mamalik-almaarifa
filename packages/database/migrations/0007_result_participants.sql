CREATE TABLE "game"."result_participants" (
	"match_id" text NOT NULL,
	"player_id" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" uuid NOT NULL,
	CONSTRAINT "result_participants_match_id_player_id_pk" PRIMARY KEY("match_id","player_id"),
	CONSTRAINT "participant_seat" CHECK ("game"."result_participants"."player_id" IN ('p_teal', 'p_blue', 'p_gold'))
);
--> statement-breakpoint
ALTER TABLE "game"."result_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "game"."result_participants" ADD CONSTRAINT "result_participants_match_id_match_results_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "game"."match_results"("match_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_account_per_match" ON "game"."result_participants" USING btree ("match_id","issuer","subject");