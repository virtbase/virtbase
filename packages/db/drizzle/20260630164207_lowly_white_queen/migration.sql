ALTER TABLE "two_factors" ADD COLUMN "failed_verification_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factors" ALTER COLUMN "failed_verification_count" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "two_factors" ADD COLUMN "locked_until" timestamp(6) with time zone;