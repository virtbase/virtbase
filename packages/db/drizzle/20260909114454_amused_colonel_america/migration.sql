DROP INDEX "accounts_issuer_provider_account_id_index";--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "issuer";