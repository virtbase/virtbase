-- Holds a subnet for the provisioning run that selected it, until that run
-- writes its allocation row. NULL on every existing row is correct: nothing is
-- mid-provision at migration time, and NULL means "not held".
ALTER TABLE "subnets" ADD COLUMN "reserved_until" timestamp with time zone;--> statement-breakpoint
-- Finland charges 25.5%, and every other configured rate is a whole number, so
-- an `int4` column looked fine until the first Finnish order - which failed
-- after the customer had already paid. Widening keeps the unit (a percentage)
-- and every existing value: 19 becomes 19.00. Reversible in principle with
-- `TYPE integer USING round("tax_rate_percentage")::integer`, which loses only
-- precision the column never had.
ALTER TABLE "order_items" ALTER COLUMN "tax_rate_percentage" SET DATA TYPE numeric(5,2) USING "tax_rate_percentage"::numeric(5,2);--> statement-breakpoint
CREATE INDEX "abuse_case_servers_locked_at_index" ON "abuse_case_servers" ("locked_at") WHERE "released_at" IS NULL AND "lock_level" <> 'none';--> statement-breakpoint
CREATE INDEX "proxmox_iso_downloads_expires_at_index" ON "proxmox_iso_downloads" ("expires_at");--> statement-breakpoint
CREATE INDEX "server_backups_started_at_index" ON "server_backups" ("started_at") WHERE "finished_at" IS NULL;--> statement-breakpoint
-- Fail closed rather than let CREATE UNIQUE INDEX report the problem as a
-- constraint violation with no context. If two live allocations of one subnet
-- already exist, two customers are configured with one address and somebody
-- has to decide which of them keeps it - a migration must not pick.
DO $$ BEGIN
	IF EXISTS (
		SELECT 1
		FROM "subnet_allocations"
		WHERE "deallocated_at" IS NULL
		GROUP BY "subnet_id"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'IPAM migration: a subnet already has more than one live allocation. Inventory them with: SELECT subnet_id, array_agg(id) FROM subnet_allocations WHERE deallocated_at IS NULL GROUP BY subnet_id HAVING count(*) > 1; then release all but the allocation that is really in force before retrying.';
	END IF;
END $$;--> statement-breakpoint
-- One live allocation per subnet. The invariant behind the whole IPAM race:
-- two customers on one address breaks networking for both, and makes every
-- later abuse report about that address unattributable, because point-in-time
-- attribution finds two holders at equal mask length and refuses to guess.
-- Partial, so the released rows that attribution reads are unaffected.
CREATE UNIQUE INDEX "subnet_allocations_subnet_id_live_index" ON "subnet_allocations" ("subnet_id") WHERE "deallocated_at" IS NULL;--> statement-breakpoint
-- Abuse attribution asks `cidr >>= $address` twice per signal. A btree - all
-- the unique constraint on `cidr` gives - cannot answer containment, so that
-- was a sequential scan of a table that gains a row per address ever carved
-- and never loses one.
CREATE INDEX "subnets_cidr_gist_index" ON "subnets" USING gist ("cidr" inet_ops);
