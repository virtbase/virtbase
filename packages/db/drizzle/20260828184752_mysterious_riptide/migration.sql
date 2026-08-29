CREATE TYPE "abuse_case_resolutions" AS ENUM('fixed_by_customer', 'mitigated_by_operator', 'false_positive', 'not_our_range', 'terminated', 'no_response');--> statement-breakpoint
CREATE TYPE "abuse_case_severities" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "abuse_case_statuses" AS ENUM('triage', 'open', 'awaiting_customer', 'awaiting_operator', 'mitigated', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "abuse_categories" AS ENUM('spam', 'phishing', 'malware', 'port_scan', 'ddos', 'copyright', 'compromised', 'other');--> statement-breakpoint
CREATE TYPE "abuse_enforcement_levels" AS ENUM('none', 'throttle', 'isolate', 'power_off', 'terminate');--> statement-breakpoint
CREATE TYPE "abuse_event_actors" AS ENUM('customer', 'operator', 'system', 'source');--> statement-breakpoint
CREATE TYPE "abuse_message_authors" AS ENUM('customer', 'operator', 'system', 'reporter');--> statement-breakpoint
CREATE TYPE "abuse_message_visibilities" AS ENUM('public', 'internal');--> statement-breakpoint
CREATE TYPE "signal_attributions" AS ENUM('unattributed', 'attributed', 'stale', 'ambiguous');--> statement-breakpoint
CREATE TYPE "signal_severities" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "signal_states" AS ENUM('firing', 'resolved');--> statement-breakpoint
CREATE TYPE "signal_subject_kinds" AS ENUM('ip', 'cidr', 'server', 'user', 'node', 'order', 'none');--> statement-breakpoint
CREATE TYPE "notification_audiences" AS ENUM('user', 'operator');--> statement-breakpoint
CREATE TYPE "notification_delivery_statuses" AS ENUM('pending', 'delivered', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "notification_severities" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TABLE "abuse_case_events" (
	"id" text PRIMARY KEY,
	"case_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_kind" "abuse_event_actors" NOT NULL,
	"actor_user_id" text,
	"from_value" text,
	"to_value" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abuse_case_messages" (
	"id" text PRIMARY KEY,
	"case_id" text NOT NULL,
	"author_kind" "abuse_message_authors" NOT NULL,
	"author_user_id" text,
	"author_email" text,
	"visibility" "abuse_message_visibilities" DEFAULT 'public'::"abuse_message_visibilities" NOT NULL,
	"body" text NOT NULL,
	"body_html" text,
	"message_id" text,
	"in_reply_to" text,
	"email_id" text,
	"attachments" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abuse_case_servers" (
	"id" text PRIMARY KEY,
	"case_id" text NOT NULL,
	"server_id" text NOT NULL,
	"lock_level" "abuse_enforcement_levels" DEFAULT 'none'::"abuse_enforcement_levels" NOT NULL,
	"locked_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"last_asserted_at" timestamp with time zone,
	"drift_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abuse_case_servers_case_id_server_id_unique" UNIQUE("case_id","server_id")
);
--> statement-breakpoint
CREATE TABLE "abuse_cases" (
	"id" text PRIMARY KEY,
	"number" integer UNIQUE GENERATED ALWAYS AS IDENTITY (sequence name "abuse_cases_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"category" "abuse_categories" NOT NULL,
	"severity" "abuse_case_severities" NOT NULL,
	"status" "abuse_case_statuses" DEFAULT 'triage'::"abuse_case_statuses" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"enforcement" "abuse_enforcement_levels" DEFAULT 'none'::"abuse_enforcement_levels" NOT NULL,
	"enforce_at" timestamp with time zone,
	"enforced_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"blocks_ordering" boolean DEFAULT false NOT NULL,
	"respond_by" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"observe_until" timestamp with time zone,
	"stale_attribution" boolean DEFAULT false NOT NULL,
	"mailbox_address" text UNIQUE,
	"assigned_to" text,
	"opened_by" text,
	"resolution" "abuse_case_resolutions",
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abuse_rules" (
	"id" text PRIMARY KEY,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"match_type" text NOT NULL,
	"match_source" text,
	"match_severity_min" "signal_severities",
	"match_confidence_min" integer,
	"match_labels" jsonb DEFAULT '{}' NOT NULL,
	"match_repeat_count_min" integer,
	"trusted_source" boolean DEFAULT false NOT NULL,
	"action_open_case" boolean DEFAULT true NOT NULL,
	"action_category" "abuse_categories",
	"action_case_severity" "abuse_case_severities",
	"action_enforcement" "abuse_enforcement_levels" DEFAULT 'none'::"abuse_enforcement_levels" NOT NULL,
	"action_grace_minutes" integer DEFAULT 0 NOT NULL,
	"action_block_orders" boolean DEFAULT false NOT NULL,
	"action_notify_user" boolean DEFAULT true NOT NULL,
	"action_response_hours" integer DEFAULT 24 NOT NULL,
	"action_auto_close_hours" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abuse_source_cursors" (
	"id" text PRIMARY KEY,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"watermark" timestamp with time zone NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abuse_source_cursors_source_target_unique" UNIQUE("source","target")
);
--> statement-breakpoint
CREATE TABLE "abuse_signals" (
	"id" text PRIMARY KEY,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"type" text NOT NULL,
	"state" "signal_states" DEFAULT 'firing'::"signal_states" NOT NULL,
	"severity" "signal_severities" NOT NULL,
	"subject_kind" "signal_subject_kinds" NOT NULL,
	"subject_value" text,
	"title" text NOT NULL,
	"body" text,
	"labels" jsonb DEFAULT '{}' NOT NULL,
	"confidence" integer,
	"reporter_name" text,
	"reporter_email" text,
	"reporter_organization" text,
	"raw" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"resolved_at" timestamp with time zone,
	"attribution" "signal_attributions" DEFAULT 'unattributed'::"signal_attributions" NOT NULL,
	"server_id" text,
	"user_id" text,
	"case_id" text,
	"matched_rule_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abuse_signals_source_external_id_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" text PRIMARY KEY,
	"notification_key" text NOT NULL,
	"dedupe_key" text NOT NULL UNIQUE,
	"audience" "notification_audiences" NOT NULL,
	"user_id" text,
	"target_id" text,
	"channel" text NOT NULL,
	"severity" "notification_severities" NOT NULL,
	"group_key" text,
	"params" jsonb DEFAULT '{}' NOT NULL,
	"url" text,
	"status" "notification_delivery_statuses" DEFAULT 'pending'::"notification_delivery_statuses" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"external_id" text,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_target_secrets" (
	"id" text PRIMARY KEY,
	"target_id" text NOT NULL,
	"key" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_target_secrets_target_id_key_unique" UNIQUE("target_id","key")
);
--> statement-breakpoint
CREATE TABLE "notification_targets" (
	"id" text PRIMARY KEY,
	"enabled" boolean DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"audience" "notification_audiences" DEFAULT 'operator'::"notification_audiences" NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"wrapped_data_key" text,
	"match_keys" text[] NOT NULL,
	"min_severity" "notification_severities" DEFAULT 'info'::"notification_severities" NOT NULL,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ordering_blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ordering_block_reason" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "abuse_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "abuse_lock_level" "abuse_enforcement_levels";--> statement-breakpoint
CREATE INDEX "abuse_case_events_case_id_created_at_index" ON "abuse_case_events" ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "abuse_case_messages_case_id_created_at_index" ON "abuse_case_messages" ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "abuse_case_messages_message_id_index" ON "abuse_case_messages" ("message_id");--> statement-breakpoint
CREATE INDEX "abuse_case_servers_server_id_index" ON "abuse_case_servers" ("server_id");--> statement-breakpoint
CREATE INDEX "abuse_cases_user_id_index" ON "abuse_cases" ("user_id");--> statement-breakpoint
CREATE INDEX "abuse_cases_status_index" ON "abuse_cases" ("status");--> statement-breakpoint
CREATE INDEX "abuse_cases_assigned_to_index" ON "abuse_cases" ("assigned_to");--> statement-breakpoint
CREATE INDEX "abuse_cases_status_respond_by_index" ON "abuse_cases" ("status","respond_by");--> statement-breakpoint
CREATE INDEX "abuse_cases_status_enforce_at_index" ON "abuse_cases" ("status","enforce_at");--> statement-breakpoint
CREATE INDEX "abuse_cases_status_observe_until_index" ON "abuse_cases" ("status","observe_until");--> statement-breakpoint
CREATE INDEX "abuse_rules_enabled_priority_index" ON "abuse_rules" ("enabled","priority");--> statement-breakpoint
CREATE INDEX "abuse_source_cursors_last_polled_at_index" ON "abuse_source_cursors" ("last_polled_at");--> statement-breakpoint
CREATE INDEX "abuse_signals_case_id_index" ON "abuse_signals" ("case_id");--> statement-breakpoint
CREATE INDEX "abuse_signals_server_id_index" ON "abuse_signals" ("server_id");--> statement-breakpoint
CREATE INDEX "abuse_signals_user_id_index" ON "abuse_signals" ("user_id");--> statement-breakpoint
CREATE INDEX "abuse_signals_type_index" ON "abuse_signals" ("type");--> statement-breakpoint
CREATE INDEX "abuse_signals_subject_kind_subject_value_index" ON "abuse_signals" ("subject_kind","subject_value");--> statement-breakpoint
CREATE INDEX "abuse_signals_state_severity_index" ON "abuse_signals" ("state","severity");--> statement-breakpoint
CREATE INDEX "abuse_signals_last_seen_at_index" ON "abuse_signals" ("last_seen_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_next_attempt_at_index" ON "notification_deliveries" ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_group_key_index" ON "notification_deliveries" ("group_key");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_id_index" ON "notification_deliveries" ("user_id");--> statement-breakpoint
CREATE INDEX "notification_targets_enabled_index" ON "notification_targets" ("enabled");--> statement-breakpoint
CREATE INDEX "notification_targets_channel_index" ON "notification_targets" ("channel");--> statement-breakpoint
CREATE INDEX "servers_abuse_locked_at_index" ON "servers" ("abuse_locked_at");--> statement-breakpoint
ALTER TABLE "abuse_case_events" ADD CONSTRAINT "abuse_case_events_case_id_abuse_cases_id_fkey" FOREIGN KEY ("case_id") REFERENCES "abuse_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_case_events" ADD CONSTRAINT "abuse_case_events_actor_user_id_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_case_messages" ADD CONSTRAINT "abuse_case_messages_case_id_abuse_cases_id_fkey" FOREIGN KEY ("case_id") REFERENCES "abuse_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_case_messages" ADD CONSTRAINT "abuse_case_messages_author_user_id_users_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_case_messages" ADD CONSTRAINT "abuse_case_messages_email_id_emails_id_fkey" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_case_servers" ADD CONSTRAINT "abuse_case_servers_case_id_abuse_cases_id_fkey" FOREIGN KEY ("case_id") REFERENCES "abuse_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_case_servers" ADD CONSTRAINT "abuse_case_servers_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_cases" ADD CONSTRAINT "abuse_cases_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_cases" ADD CONSTRAINT "abuse_cases_assigned_to_users_id_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_cases" ADD CONSTRAINT "abuse_cases_opened_by_users_id_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_cases" ADD CONSTRAINT "abuse_cases_closed_by_users_id_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_signals" ADD CONSTRAINT "abuse_signals_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_signals" ADD CONSTRAINT "abuse_signals_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_signals" ADD CONSTRAINT "abuse_signals_case_id_abuse_cases_id_fkey" FOREIGN KEY ("case_id") REFERENCES "abuse_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "abuse_signals" ADD CONSTRAINT "abuse_signals_matched_rule_id_abuse_rules_id_fkey" FOREIGN KEY ("matched_rule_id") REFERENCES "abuse_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_target_id_notification_targets_id_fkey" FOREIGN KEY ("target_id") REFERENCES "notification_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_target_secrets" ADD CONSTRAINT "notification_target_secrets_hqU9a2bPsjR6_fkey" FOREIGN KEY ("target_id") REFERENCES "notification_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;