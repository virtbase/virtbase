CREATE TYPE "renewal_statuses" AS ENUM('pending', 'collecting', 'awaiting_action', 'succeeded', 'failed', 'abandoned');--> statement-breakpoint
CREATE TYPE "subscription_statuses" AS ENUM('active', 'past_due', 'suspended', 'cancelled', 'ended');--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"type" text NOT NULL,
	"brand" text,
	"last4" text,
	"exp_month" smallint,
	"exp_year" smallint,
	"is_default" boolean DEFAULT false NOT NULL,
	"invalid_at" timestamp with time zone,
	"invalid_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detached_at" timestamp with time zone,
	CONSTRAINT "payment_methods_provider_external_id_unique" UNIQUE("provider","external_id"),
	CONSTRAINT "payment_methods_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_renewals" (
	"id" text PRIMARY KEY,
	"subscription_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" "renewal_statuses" DEFAULT 'pending'::"renewal_statuses" NOT NULL,
	"attempt" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"failure_code" text,
	"failure_message" text,
	"order_id" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_renewals_subscription_id_period_start_unique" UNIQUE("subscription_id","period_start"),
	CONSTRAINT "subscription_renewals_period_range" CHECK ("period_end" > "period_start"),
	CONSTRAINT "subscription_renewals_amount_positive" CHECK ("amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"subject_type" text DEFAULT 'server' NOT NULL,
	"subject_id" text NOT NULL,
	"status" "subscription_statuses" DEFAULT 'active'::"subscription_statuses" NOT NULL,
	"server_plan_price_id" text NOT NULL,
	"interval_months" smallint DEFAULT 1 NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"payment_method_id" text,
	"mandate_accepted_at" timestamp with time zone,
	"mandate_text_version" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_period_range" CHECK ("current_period_end" > "current_period_start"),
	CONSTRAINT "subscriptions_subject_type_known" CHECK ("subject_type" IN ('server'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_user_id_default_index" ON "payment_methods" ("user_id") WHERE "is_default" AND "detached_at" IS NULL;--> statement-breakpoint
CREATE INDEX "payment_methods_user_id_index" ON "payment_methods" ("user_id") WHERE "detached_at" IS NULL;--> statement-breakpoint
CREATE INDEX "subscription_renewals_next_attempt_at_index" ON "subscription_renewals" ("next_attempt_at") WHERE "status" IN ('pending', 'awaiting_action');--> statement-breakpoint
CREATE INDEX "subscription_renewals_updated_at_index" ON "subscription_renewals" ("updated_at") WHERE "status" = 'collecting';--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_subject_live_index" ON "subscriptions" ("subject_type","subject_id") WHERE "status" <> 'ended';--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_index" ON "subscriptions" ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_current_period_end_index" ON "subscriptions" ("current_period_end") WHERE "status" IN ('active', 'past_due') AND "auto_renew";--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_server_plan_price_id_server_plan_prices_id_fkey" FOREIGN KEY ("server_plan_price_id") REFERENCES "server_plan_prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payment_method_owner_fkey" FOREIGN KEY ("payment_method_id","user_id") REFERENCES "payment_methods"("id","user_id") ON UPDATE CASCADE;