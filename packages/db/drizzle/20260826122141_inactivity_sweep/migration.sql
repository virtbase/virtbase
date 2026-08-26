ALTER TABLE "users" ADD COLUMN "deletion_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
-- Seed `last_seen_at` from what the database already knows.
--
-- [!] Not optional. The inactivity sweep reads this column, and an account
-- whose column is NULL because it has only existed since this migration is
-- indistinguishable from one that has genuinely not been touched in six
-- months. Without this backfill, arming the sweep would schedule every
-- long-standing customer for deletion at once.
--
-- Sessions only live three days, so `max(sessions.updated_at)` is a floor
-- rather than the truth. `users.updated_at` is the fallback, and both are
-- deliberately conservative: reading someone as *more* recently active than
-- they were is the safe direction to be wrong in.
UPDATE "users"
SET "last_seen_at" = GREATEST(
  COALESCE((
    SELECT MAX("sessions"."updated_at")
    FROM "sessions"
    WHERE "sessions"."user_id" = "users"."id"
  ), "users"."updated_at"),
  "users"."updated_at"
)
WHERE "last_seen_at" IS NULL;
