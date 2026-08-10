CREATE TYPE "order_statuses" AS ENUM('draft', 'awaiting_payment', 'paid', 'fulfilling', 'fulfilled', 'failed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "order_types" AS ENUM('new_server', 'extend_server', 'upgrade_server');--> statement-breakpoint
CREATE TYPE "payment_statuses" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY,
	"order_id" text NOT NULL,
	"server_plan_id" text,
	"server_plan_price_id" text,
	"name" text NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount" integer NOT NULL,
	"tax_rate_percentage" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_transitions" (
	"id" text PRIMARY KEY,
	"order_id" text NOT NULL,
	"from_status" "order_statuses",
	"to_status" "order_statuses" NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"type" "order_types" NOT NULL,
	"status" "order_statuses" DEFAULT 'draft'::"order_statuses" NOT NULL,
	"total_amount" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"configuration" jsonb NOT NULL,
	"root_password_ciphertext" text,
	"server_id" text,
	"failure_reason" text,
	"paid_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"payment_id" text,
	"order_id" text,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_provider_event_id_unique" UNIQUE("provider","event_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY,
	"order_id" text,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"status" "payment_statuses" DEFAULT 'pending'::"payment_statuses" NOT NULL,
	"amount" integer NOT NULL,
	"captured_amount" integer DEFAULT 0 NOT NULL,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"method" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_external_id_unique" UNIQUE("provider","external_id")
);
--> statement-breakpoint
CREATE INDEX "order_items_order_id_index" ON "order_items" ("order_id");--> statement-breakpoint
CREATE INDEX "order_transitions_order_id_index" ON "order_transitions" ("order_id");--> statement-breakpoint
CREATE INDEX "orders_user_id_index" ON "orders" ("user_id");--> statement-breakpoint
CREATE INDEX "orders_status_index" ON "orders" ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_index" ON "orders" ("created_at");--> statement-breakpoint
CREATE INDEX "payment_events_order_id_index" ON "payment_events" ("order_id");--> statement-breakpoint
CREATE INDEX "payments_order_id_index" ON "payments" ("order_id");--> statement-breakpoint
CREATE INDEX "payments_user_id_index" ON "payments" ("user_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_server_plan_id_server_plans_id_fkey" FOREIGN KEY ("server_plan_id") REFERENCES "server_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_server_plan_price_id_server_plan_prices_id_fkey" FOREIGN KEY ("server_plan_price_id") REFERENCES "server_plan_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "order_transitions" ADD CONSTRAINT "order_transitions_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;