CREATE TYPE "abuse_contact_kinds" AS ENUM('reporter', 'authority', 'upstream');--> statement-breakpoint
CREATE TYPE "abuse_message_audiences" AS ENUM('customer', 'internal', 'reporter');--> statement-breakpoint
CREATE TABLE "abuse_case_contacts" (
	"id" text PRIMARY KEY,
	"case_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"organization" text,
	"kind" "abuse_contact_kinds" DEFAULT 'reporter'::"abuse_contact_kinds" NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"notify" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abuse_case_contacts_case_id_email_unique" UNIQUE("case_id","email")
);
--> statement-breakpoint
ALTER TABLE "abuse_case_messages" ADD COLUMN "audience" "abuse_message_audiences" DEFAULT 'customer'::"abuse_message_audiences" NOT NULL;--> statement-breakpoint
-- Carry the old two-way visibility across before dropping it. `public` meant
-- "the customer sees it", which is exactly the new `customer`; `internal`
-- keeps its meaning. Written by hand because drizzle-kit generates the add and
-- the drop but nothing between them.
UPDATE "abuse_case_messages"
SET "audience" = CASE
  WHEN "visibility" = 'internal' THEN 'internal'::"abuse_message_audiences"
  ELSE 'customer'::"abuse_message_audiences"
END;--> statement-breakpoint
ALTER TABLE "abuse_case_messages" DROP COLUMN "visibility";--> statement-breakpoint
CREATE INDEX "abuse_case_contacts_email_index" ON "abuse_case_contacts" ("email");--> statement-breakpoint
ALTER TABLE "abuse_case_contacts" ADD CONSTRAINT "abuse_case_contacts_case_id_abuse_cases_id_fkey" FOREIGN KEY ("case_id") REFERENCES "abuse_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
DROP TYPE "abuse_message_visibilities";