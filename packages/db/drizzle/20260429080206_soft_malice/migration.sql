ALTER TABLE "server_plans" ADD COLUMN "recommended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" RENAME CONSTRAINT "transactions_paymentMethod_externalId_unique" TO "transactions_payment_method_external_id_unique";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "users_stripeCustomerId_unique" TO "users_stripe_customer_id_key";--> statement-breakpoint
ALTER TABLE "invoices" RENAME CONSTRAINT "invoices_lexwareInvoiceId_unique" TO "invoices_lexware_invoice_id_key";--> statement-breakpoint
CREATE UNIQUE INDEX "server_plans_proxmox_node_group_id_recommended_index" ON "server_plans" ("proxmox_node_group_id") WHERE "recommended" IS TRUE;