CREATE TYPE "integration_health_statuses" AS ENUM('unknown', 'ok', 'degraded', 'error');--> statement-breakpoint
CREATE TABLE "integration_installations" (
	"id" text PRIMARY KEY,
	"integration_id" text NOT NULL UNIQUE,
	"enabled" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"wrapped_data_key" text,
	"health_status" "integration_health_statuses" DEFAULT 'unknown'::"integration_health_statuses" NOT NULL,
	"health_message" text,
	"health_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_secrets" (
	"id" text PRIMARY KEY,
	"installation_id" text NOT NULL,
	"key" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_secrets_installation_id_key_unique" UNIQUE("installation_id","key")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "integration_installations_enabled_index" ON "integration_installations" ("enabled");--> statement-breakpoint
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_beqbjNoz0TKq_fkey" FOREIGN KEY ("installation_id") REFERENCES "integration_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;