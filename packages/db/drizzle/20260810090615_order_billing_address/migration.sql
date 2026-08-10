ALTER TABLE "orders" ADD COLUMN "billing_address" jsonb;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "tax_rate_percentage" DROP NOT NULL;