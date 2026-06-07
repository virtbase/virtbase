CREATE TABLE "two_factors" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean;--> statement-breakpoint
CREATE INDEX "two_factors_user_id_index" ON "two_factors" ("user_id");--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;