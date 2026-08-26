ALTER TABLE "servers" ADD COLUMN "detected_os_id" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "detected_os_name" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "detected_os_version" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "detected_os_kernel" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "detected_os_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "servers_detected_os_at_index" ON "servers" ("detected_os_at");