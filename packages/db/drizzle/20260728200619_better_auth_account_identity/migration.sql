-- Better Auth 1.7: rename provider account key and backfill issuer identity.
ALTER TABLE "accounts" RENAME COLUMN "account_id" TO "provider_account_id";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "accounts"
SET
	"issuer" = 'local:credential',
	"provider_account_id" = "user_id"
WHERE "provider_id" = 'credential';--> statement-breakpoint
UPDATE "accounts"
SET "issuer" = 'https://accounts.google.com'
WHERE "provider_id" = 'google';--> statement-breakpoint
UPDATE "accounts"
SET "issuer" = 'local:oauth:github'
WHERE "provider_id" = 'github';--> statement-breakpoint
UPDATE "accounts"
SET "issuer" = 'local:oauth:discord'
WHERE "provider_id" = 'discord';--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM "accounts" WHERE "issuer" IS NULL) THEN
		RAISE EXCEPTION 'Better Auth 1.7 migration: unmapped accounts.provider_id values remain. Inventory distinct provider IDs and extend the backfill before retrying.';
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (
		SELECT 1
		FROM "accounts"
		GROUP BY "issuer", "provider_account_id"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'Better Auth 1.7 migration: (issuer, provider_account_id) collision detected. Resolve duplicate account rows before retrying.';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_issuer_provider_account_id_index" ON "accounts" ("issuer","provider_account_id");
