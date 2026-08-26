CREATE TYPE "account_deletion_reasons" AS ENUM('inactivity', 'user_request', 'admin_request');--> statement-breakpoint
CREATE TYPE "data_export_statuses" AS ENUM('pending', 'building', 'ready', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "account_deletion_tokens" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_exports" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"status" "data_export_statuses" DEFAULT 'pending'::"data_export_statuses" NOT NULL,
	"artifact" bytea,
	"byte_size" integer,
	"failure_reason" text,
	"downloaded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erasure_log" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"reason" "account_deletion_reasons" NOT NULL,
	"destroyed" jsonb NOT NULL,
	"retained" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_reason" "account_deletion_reasons";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "offboarding_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "users_deletion_scheduled_at_index" ON "users" ("deletion_scheduled_at");--> statement-breakpoint
CREATE INDEX "users_last_seen_at_index" ON "users" ("last_seen_at");--> statement-breakpoint
CREATE INDEX "account_deletion_tokens_user_id_index" ON "account_deletion_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "account_deletion_tokens_expires_at_index" ON "account_deletion_tokens" ("expires_at");--> statement-breakpoint
CREATE INDEX "data_exports_user_id_index" ON "data_exports" ("user_id");--> statement-breakpoint
CREATE INDEX "data_exports_status_index" ON "data_exports" ("status");--> statement-breakpoint
CREATE INDEX "data_exports_expires_at_index" ON "data_exports" ("expires_at");--> statement-breakpoint
CREATE INDEX "erasure_log_user_id_index" ON "erasure_log" ("user_id");--> statement-breakpoint
CREATE INDEX "erasure_log_completed_at_index" ON "erasure_log" ("completed_at");--> statement-breakpoint
ALTER TABLE "account_deletion_tokens" ADD CONSTRAINT "account_deletion_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;