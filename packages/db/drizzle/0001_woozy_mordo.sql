CREATE TYPE "public"."payment_methods" AS ENUM('stripe', 'anonpay');--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"payment_method" "payment_methods" NOT NULL,
	"external_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_paymentMethod_externalId_unique" UNIQUE("payment_method","external_id")
);
--> statement-breakpoint
DROP INDEX "invoices_stripe_charge_id_index";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "transactions_user_id_index" ON "transactions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "stripe_charge_id";