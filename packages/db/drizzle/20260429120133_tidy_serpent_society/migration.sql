ALTER TABLE "server_plans" ADD COLUMN "upsell_to" text;--> statement-breakpoint
ALTER TABLE "server_plans" ADD CONSTRAINT "server_plans_upsell_to_server_plans_id_fkey" FOREIGN KEY ("upsell_to") REFERENCES "server_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "server_plans" ADD CONSTRAINT "upsell_to_is_not_self" CHECK ("upsell_to" IS DISTINCT FROM "id");