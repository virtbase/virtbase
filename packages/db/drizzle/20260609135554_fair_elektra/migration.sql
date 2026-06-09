CREATE TABLE "emails" (
	"id" text PRIMARY KEY,
	"external_id" text UNIQUE,
	"from" text NOT NULL,
	"to" text[] NOT NULL,
	"cc" text[],
	"bcc" text[],
	"reply_to" text[],
	"subject" text NOT NULL,
	"html" text,
	"text" text,
	"tags" jsonb,
	"last_event" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "emails_external_id_index" ON "emails" ("external_id");--> statement-breakpoint
CREATE INDEX "emails_from_index" ON "emails" ("from");--> statement-breakpoint
CREATE INDEX "emails_to_index" ON "emails" ("to");--> statement-breakpoint
CREATE INDEX "emails_last_event_index" ON "emails" ("last_event");