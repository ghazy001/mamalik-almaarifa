CREATE TABLE "content"."requests" (
	"issuer" text NOT NULL,
	"subject" uuid NOT NULL,
	"key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_issuer_subject_key_pk" PRIMARY KEY("issuer","subject","key")
);
--> statement-breakpoint
ALTER TABLE "content"."requests" ENABLE ROW LEVEL SECURITY;