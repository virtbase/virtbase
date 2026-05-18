CREATE TYPE "discount_applies_to" AS ENUM('PURCHASE', 'RENEWAL', 'BOTH');--> statement-breakpoint
CREATE TYPE "discount_types" AS ENUM('PERCENTAGE', 'FIXED');--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"type" "discount_types" NOT NULL,
	"amount" integer NOT NULL,
	"applies_to" "discount_applies_to" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_amount_range" CHECK (("type" = 'PERCENTAGE' AND "amount" BETWEEN 1 AND 100) OR ("type" = 'FIXED' AND "amount" > 0))
);
--> statement-breakpoint
CREATE TABLE "discounts_to_server_plans" (
	"discount_id" text,
	"server_plan_id" text,
	CONSTRAINT "discounts_to_server_plans_pkey" PRIMARY KEY("discount_id","server_plan_id")
);
--> statement-breakpoint
CREATE TABLE "server_plan_prices" (
	"id" text PRIMARY KEY,
	"server_plan_id" text NOT NULL,
	"purchase_price" integer NOT NULL,
	"renewal_price" integer NOT NULL,
	"purchase_discount_id" text,
	"renewal_discount_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "server_plan_prices_server_plan_id_index" ON "server_plan_prices" ("server_plan_id");--> statement-breakpoint
ALTER TABLE "discounts_to_server_plans" ADD CONSTRAINT "discounts_to_server_plans_discount_id_discounts_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "discounts_to_server_plans" ADD CONSTRAINT "discounts_to_server_plans_server_plan_id_server_plans_id_fkey" FOREIGN KEY ("server_plan_id") REFERENCES "server_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "server_plan_prices" ADD CONSTRAINT "server_plan_prices_server_plan_id_server_plans_id_fkey" FOREIGN KEY ("server_plan_id") REFERENCES "server_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "server_plan_prices" ADD CONSTRAINT "server_plan_prices_purchase_discount_id_discounts_id_fkey" FOREIGN KEY ("purchase_discount_id") REFERENCES "discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "server_plan_prices" ADD CONSTRAINT "server_plan_prices_renewal_discount_id_discounts_id_fkey" FOREIGN KEY ("renewal_discount_id") REFERENCES "discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
-- Add the new FK as nullable first so we can backfill existing servers
-- before enforcing NOT NULL. The schema declares the column NOT NULL,
-- so we tighten the constraint at the end of this migration.
ALTER TABLE "servers" ADD COLUMN "server_plan_price_id" text;--> statement-breakpoint
-- Mirror the existing catalog price into one `server_plan_prices` row per
-- distinct plan that currently has servers attached. Before discounts
-- existed, every server on a given plan was charged the catalog `price`
-- for both purchase and renewal, so we seed a single price row per plan
-- that captures exactly that. The backfilled id reuses the plan's ULID
-- body so the result matches the `price_[A-Z0-9]{25}` regex used by the
-- API validators (plan ids look like `pck_<25 ULID chars>`).
INSERT INTO "server_plan_prices"
  ("id", "server_plan_id", "purchase_price", "renewal_price", "created_at", "updated_at")
SELECT
  'price_' || SUBSTR(sp."id", 5) AS "id",
  sp."id" AS "server_plan_id",
  sp."price" AS "purchase_price",
  sp."price" AS "renewal_price",
  now() AS "created_at",
  now() AS "updated_at"
FROM "server_plans" sp
WHERE EXISTS (SELECT 1 FROM "servers" s WHERE s."server_plan_id" = sp."id");--> statement-breakpoint
UPDATE "servers" AS s
SET "server_plan_price_id" = 'price_' || SUBSTR(s."server_plan_id", 5)
WHERE s."server_plan_price_id" IS NULL;--> statement-breakpoint
ALTER TABLE "servers" ALTER COLUMN "server_plan_price_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_server_plan_price_id_server_plan_prices_id_fkey" FOREIGN KEY ("server_plan_price_id") REFERENCES "server_plan_prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;