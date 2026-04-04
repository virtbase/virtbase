CREATE TYPE "public"."proxmox_node_group_strategy" AS ENUM('RANDOM', 'ROUND_ROBIN', 'LEAST_USED', 'FILL');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text,
	"reference_id" text,
	"config_id" text DEFAULT 'default' NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp with time zone,
	"enabled" boolean NOT NULL,
	"rate_limit_enabled" boolean NOT NULL,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer NOT NULL,
	"remaining" integer,
	"last_request" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"permissions" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"public_key" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"stripe_customer_id" text,
	"role" text DEFAULT 'CUSTOMER' NOT NULL,
	"locale" text,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_stripeCustomerId_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datacenters" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "datacenters_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_charge_id" text,
	"lexware_invoice_id" uuid NOT NULL,
	"number" text NOT NULL,
	"total" integer NOT NULL,
	"tax_amount" integer NOT NULL,
	"reverse_charge" boolean NOT NULL,
	"cancelled_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_lexwareInvoiceId_unique" UNIQUE("lexware_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "pointer_records" (
	"id" text PRIMARY KEY NOT NULL,
	"subnet_allocation_id" text NOT NULL,
	"ip" "inet" NOT NULL,
	"hostname" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pointer_records_ip_unique" UNIQUE("ip")
);
--> statement-breakpoint
CREATE TABLE "proxmox_node_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"strategy" "proxmox_node_group_strategy" DEFAULT 'ROUND_ROBIN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proxmox_node_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "proxmox_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"datacenter_id" text NOT NULL,
	"proxmox_node_group_id" text NOT NULL,
	"hostname" text NOT NULL,
	"fqdn" text NOT NULL,
	"token_id" text NOT NULL,
	"token_secret" text NOT NULL,
	"storage_description" text,
	"memory_description" text,
	"cpu_description" text,
	"netrate" integer DEFAULT 125,
	"guest_limit" integer,
	"memory_limit" integer,
	"storage_limit" integer,
	"netrate_limit" smallint,
	"cores_limit" smallint,
	"snippet_storage" text NOT NULL,
	"backup_storage" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proxmox_template_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proxmox_template_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "proxmox_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"proxmox_template_group_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"required_cores" smallint,
	"recommended_cores" smallint,
	"required_memory" integer,
	"recommended_memory" integer,
	"required_storage" integer,
	"recommended_storage" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proxmox_templates_to_proxmox_nodes" (
	"proxmox_template_id" text NOT NULL,
	"proxmox_node_id" text NOT NULL,
	"vmid" integer NOT NULL,
	"storage" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pt2pn_composite_pk" PRIMARY KEY("proxmox_template_id","proxmox_node_id")
);
--> statement-breakpoint
CREATE TABLE "server_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"proxmox_template_id" text,
	"name" varchar NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"volid" varchar,
	"size" bigint,
	"upid" varchar NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"proxmox_node_group_id" text NOT NULL,
	"name" text NOT NULL,
	"cores" smallint NOT NULL,
	"memory" integer NOT NULL,
	"storage" integer NOT NULL,
	"netrate" smallint,
	"price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"server_plan_id" text NOT NULL,
	"proxmox_node_id" text NOT NULL,
	"proxmox_template_id" text,
	"name" text NOT NULL,
	"vmid" integer NOT NULL,
	"installed_at" timestamp with time zone,
	"terminates_at" timestamp with time zone,
	"renewal_reminder_sent_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ssh_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"fingerprint" text NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subnet_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"subnet_id" text NOT NULL,
	"server_id" text,
	"description" text,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deallocated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subnets" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" varchar(255),
	"cidr" "cidr" NOT NULL,
	"gateway" "inet" NOT NULL,
	"vlan" integer DEFAULT 0 NOT NULL,
	"dns_reverse_zone" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subnets_cidr_unique" UNIQUE("cidr")
);
--> statement-breakpoint
CREATE TABLE "subnets_to_proxmox_nodes" (
	"subnet_id" text NOT NULL,
	"proxmox_node_id" text NOT NULL,
	"bridge" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subnets_to_proxmox_nodes_subnet_id_proxmox_node_id_pk" PRIMARY KEY("subnet_id","proxmox_node_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "pointer_records" ADD CONSTRAINT "pointer_records_subnet_allocation_id_subnet_allocations_id_fk" FOREIGN KEY ("subnet_allocation_id") REFERENCES "public"."subnet_allocations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "proxmox_nodes" ADD CONSTRAINT "proxmox_nodes_datacenter_id_datacenters_id_fk" FOREIGN KEY ("datacenter_id") REFERENCES "public"."datacenters"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "proxmox_nodes" ADD CONSTRAINT "proxmox_nodes_proxmox_node_group_id_proxmox_node_groups_id_fk" FOREIGN KEY ("proxmox_node_group_id") REFERENCES "public"."proxmox_node_groups"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD CONSTRAINT "proxmox_templates_proxmox_template_group_id_proxmox_template_groups_id_fk" FOREIGN KEY ("proxmox_template_group_id") REFERENCES "public"."proxmox_template_groups"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "proxmox_templates_to_proxmox_nodes" ADD CONSTRAINT "proxmox_templates_to_proxmox_nodes_proxmox_template_id_proxmox_templates_id_fk" FOREIGN KEY ("proxmox_template_id") REFERENCES "public"."proxmox_templates"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "proxmox_templates_to_proxmox_nodes" ADD CONSTRAINT "proxmox_templates_to_proxmox_nodes_proxmox_node_id_proxmox_nodes_id_fk" FOREIGN KEY ("proxmox_node_id") REFERENCES "public"."proxmox_nodes"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "server_backups" ADD CONSTRAINT "server_backups_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "server_backups" ADD CONSTRAINT "server_backups_proxmox_template_id_proxmox_templates_id_fk" FOREIGN KEY ("proxmox_template_id") REFERENCES "public"."proxmox_templates"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "server_plans" ADD CONSTRAINT "server_plans_proxmox_node_group_id_proxmox_node_groups_id_fk" FOREIGN KEY ("proxmox_node_group_id") REFERENCES "public"."proxmox_node_groups"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_server_plan_id_server_plans_id_fk" FOREIGN KEY ("server_plan_id") REFERENCES "public"."server_plans"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_proxmox_node_id_proxmox_nodes_id_fk" FOREIGN KEY ("proxmox_node_id") REFERENCES "public"."proxmox_nodes"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_proxmox_template_id_proxmox_templates_id_fk" FOREIGN KEY ("proxmox_template_id") REFERENCES "public"."proxmox_templates"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ssh_keys" ADD CONSTRAINT "ssh_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subnet_allocations" ADD CONSTRAINT "subnet_allocations_subnet_id_subnets_id_fk" FOREIGN KEY ("subnet_id") REFERENCES "public"."subnets"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subnet_allocations" ADD CONSTRAINT "subnet_allocations_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subnets" ADD CONSTRAINT "subnets_parent_id_subnets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."subnets"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subnets_to_proxmox_nodes" ADD CONSTRAINT "subnets_to_proxmox_nodes_subnet_id_subnets_id_fk" FOREIGN KEY ("subnet_id") REFERENCES "public"."subnets"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subnets_to_proxmox_nodes" ADD CONSTRAINT "subnets_to_proxmox_nodes_proxmox_node_id_proxmox_nodes_id_fk" FOREIGN KEY ("proxmox_node_id") REFERENCES "public"."proxmox_nodes"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "accounts_user_id_index" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_reference_id_index" ON "api_keys" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "passkeys_user_id_index" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkeys_credential_id_index" ON "passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_token_index" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "users_email_index" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_stripe_customer_id_index" ON "users" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_index" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "datacenters_name_index" ON "datacenters" USING btree ("name");--> statement-breakpoint
CREATE INDEX "invoices_stripe_charge_id_index" ON "invoices" USING btree ("stripe_charge_id");--> statement-breakpoint
CREATE INDEX "invoices_user_id_index" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_lexware_invoice_id_index" ON "invoices" USING btree ("lexware_invoice_id");--> statement-breakpoint
CREATE INDEX "pointer_records_subnet_allocation_id_index" ON "pointer_records" USING btree ("subnet_allocation_id");--> statement-breakpoint
CREATE INDEX "pointer_records_ip_index" ON "pointer_records" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "proxmox_nodes_datacenter_id_index" ON "proxmox_nodes" USING btree ("datacenter_id");--> statement-breakpoint
CREATE INDEX "proxmox_nodes_proxmox_node_group_id_index" ON "proxmox_nodes" USING btree ("proxmox_node_group_id");--> statement-breakpoint
CREATE INDEX "proxmox_templates_proxmox_template_group_id_index" ON "proxmox_templates" USING btree ("proxmox_template_group_id");--> statement-breakpoint
CREATE INDEX "server_backups_server_id_index" ON "server_backups" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "server_backups_proxmox_template_id_index" ON "server_backups" USING btree ("proxmox_template_id");--> statement-breakpoint
CREATE INDEX "server_backups_upid_index" ON "server_backups" USING btree ("upid");--> statement-breakpoint
CREATE INDEX "server_backups_volid_index" ON "server_backups" USING btree ("volid");--> statement-breakpoint
CREATE INDEX "server_plans_proxmox_node_group_id_index" ON "server_plans" USING btree ("proxmox_node_group_id");--> statement-breakpoint
CREATE INDEX "servers_user_id_index" ON "servers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "servers_server_plan_id_index" ON "servers" USING btree ("server_plan_id");--> statement-breakpoint
CREATE INDEX "servers_proxmox_node_id_index" ON "servers" USING btree ("proxmox_node_id");--> statement-breakpoint
CREATE INDEX "servers_proxmox_template_id_index" ON "servers" USING btree ("proxmox_template_id");--> statement-breakpoint
CREATE INDEX "ssh_keys_user_id_index" ON "ssh_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ssh_keys_fingerprint_index" ON "ssh_keys" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "subnet_allocations_subnet_id_index" ON "subnet_allocations" USING btree ("subnet_id");--> statement-breakpoint
CREATE INDEX "subnet_allocations_server_id_index" ON "subnet_allocations" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "subnets_parent_id_index" ON "subnets" USING btree ("parent_id");