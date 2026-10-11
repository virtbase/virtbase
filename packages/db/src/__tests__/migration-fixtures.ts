/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { expect } from "bun:test";
import type { Transaction } from "@electric-sql/pglite";
import { seedRow } from "../migration-gate/seed-row";

/** What a fixture needs from the database it seeds. */
export type Executor = Pick<Transaction, "exec" | "query">;

/**
 * Data a migration is tested with (DB-14): `seed` runs before the migration,
 * `verify` after it, in the same transaction.
 */
export interface Fixture {
  seed: (db: Executor) => Promise<void>;
  verify: (db: Executor) => Promise<void>;
}

const select = async <T>(db: Executor, sql: string): Promise<T[]> =>
  (await db.query<T>(sql)).rows;

const PLAN_WITH_SERVERS = `pck_${"A".repeat(25)}`;
const PLAN_WITHOUT_SERVERS = `pck_${"B".repeat(25)}`;

const roundTurbo: Fixture = {
  seed: async (db) => {
    const plan = await seedRow(db, "server_plans", {
      id: PLAN_WITH_SERVERS,
      price: 1299,
    });
    await seedRow(db, "server_plans", { id: PLAN_WITHOUT_SERVERS, price: 999 });
    await seedRow(db, "servers", { server_plan_id: plan.id });
    await seedRow(db, "servers", { server_plan_id: plan.id });
  },
  verify: async (db) => {
    const price = `price_${"A".repeat(25)}`;
    expect(
      await select(
        db,
        `SELECT "id", "server_plan_id", "purchase_price", "renewal_price" FROM "server_plan_prices" WHERE "server_plan_id" IN ('${PLAN_WITH_SERVERS}', '${PLAN_WITHOUT_SERVERS}')`,
      ),
    ).toEqual([
      {
        id: price,
        server_plan_id: PLAN_WITH_SERVERS,
        purchase_price: 1299,
        renewal_price: 1299,
      },
    ]);
    expect(
      await select(
        db,
        `SELECT "server_plan_price_id" FROM "servers" WHERE "server_plan_id" = '${PLAN_WITH_SERVERS}'`,
      ),
    ).toEqual([
      { server_plan_price_id: price },
      { server_plan_price_id: price },
    ]);
  },
};

const betterAuthAccountIdentity: Fixture = {
  seed: async (db) => {
    const user = await seedRow(db, "users", { id: "usr_credential" });
    await seedRow(db, "accounts", {
      id: "acc_credential",
      user_id: user.id,
      provider_id: "credential",
      account_id: "credential-account",
    });
    for (const provider of ["google", "github", "discord"]) {
      await seedRow(db, "accounts", {
        id: `acc_${provider}`,
        provider_id: provider,
        account_id: `${provider}-account`,
      });
    }
  },
  verify: async (db) => {
    expect(
      await select(
        db,
        `SELECT "provider_id", "issuer", "provider_account_id" FROM "accounts" WHERE "id" LIKE 'acc\\_%' ORDER BY "provider_id"`,
      ),
    ).toEqual([
      {
        provider_id: "credential",
        issuer: "local:credential",
        provider_account_id: "usr_credential",
      },
      {
        provider_id: "discord",
        issuer: "local:oauth:discord",
        provider_account_id: "discord-account",
      },
      {
        provider_id: "github",
        issuer: "local:oauth:github",
        provider_account_id: "github-account",
      },
      {
        provider_id: "google",
        issuer: "https://accounts.google.com",
        provider_account_id: "google-account",
      },
    ]);
  },
};

const templatesAsImages: Fixture = {
  seed: async (db) => {
    await seedRow(db, "proxmox_nodes", {
      id: "node_snippets",
      snippet_storage: "local",
    });
    await seedRow(db, "proxmox_templates", { id: "tpl_existing" });
  },
  verify: async (db) => {
    expect(
      await select(
        db,
        'SELECT "import_storage" FROM "proxmox_nodes" WHERE "id" = \'node_snippets\'',
      ),
    ).toEqual([{ import_storage: "local" }]);
    expect(
      await select(
        db,
        'SELECT "enabled" FROM "proxmox_templates" WHERE "id" = \'tpl_existing\'',
      ),
    ).toEqual([{ enabled: true }]);
  },
};

const nodeVmStorage: Fixture = {
  seed: async (db) => {
    const link = async (node: string, storage: string) =>
      seedRow(db, "proxmox_templates_to_proxmox_nodes", {
        proxmox_node_id: node,
        storage,
      });
    for (const id of ["node_mostly_ceph", "node_tie", "node_bare"]) {
      await seedRow(db, "proxmox_nodes", { id });
    }
    await link("node_mostly_ceph", "ceph");
    await link("node_mostly_ceph", "ceph");
    await link("node_mostly_ceph", "local-lvm");
    await link("node_tie", "zfs");
    await link("node_tie", "lvm");
  },
  verify: async (db) => {
    expect(
      await select(
        db,
        'SELECT "id", "vm_storage" FROM "proxmox_nodes" WHERE "id" IN (\'node_mostly_ceph\', \'node_tie\', \'node_bare\') ORDER BY "id"',
      ),
    ).toEqual([
      { id: "node_bare", vm_storage: "local-lvm" },
      { id: "node_mostly_ceph", vm_storage: "ceph" },
      { id: "node_tie", vm_storage: "lvm" },
    ]);
  },
};

const dropTemplateVmLinks: Fixture = {
  seed: async (db) => {
    await seedRow(db, "proxmox_templates", {
      id: "tpl_with_image",
      image_url: "https://images.example/debian.qcow2",
    });
    await seedRow(db, "proxmox_templates", { id: "tpl_unused" });
    await seedRow(db, "proxmox_templates", { id: "tpl_used_by_server" });
    await seedRow(db, "proxmox_templates", { id: "tpl_used_by_backup" });
    await seedRow(db, "servers", { proxmox_template_id: "tpl_used_by_server" });
    await seedRow(db, "server_backups", {
      proxmox_template_id: "tpl_used_by_backup",
    });
  },
  verify: async (db) => {
    const placeholder =
      "https://needs-configuration.invalid/set-a-real-image-url.qcow2";
    expect(
      await select(
        db,
        'SELECT "id", "enabled", "image_url" FROM "proxmox_templates" WHERE "id" IN (\'tpl_with_image\', \'tpl_unused\', \'tpl_used_by_server\', \'tpl_used_by_backup\') ORDER BY "id"',
      ),
    ).toEqual([
      { id: "tpl_used_by_backup", enabled: false, image_url: placeholder },
      { id: "tpl_used_by_server", enabled: false, image_url: placeholder },
      {
        id: "tpl_with_image",
        enabled: true,
        image_url: "https://images.example/debian.qcow2",
      },
    ]);
  },
};

const inactivitySweep: Fixture = {
  seed: async (db) => {
    const user = (id: string, updatedAt: string, lastSeenAt?: string) =>
      seedRow(db, "users", {
        id,
        updated_at: new Date(updatedAt),
        ...(lastSeenAt && { last_seen_at: new Date(lastSeenAt) }),
      });
    const session = (userId: string, updatedAt: string) =>
      seedRow(db, "sessions", {
        user_id: userId,
        updated_at: new Date(updatedAt),
      });
    await user("usr_recent_session", "2026-01-01T00:00:00Z");
    await session("usr_recent_session", "2026-03-01T00:00:00Z");
    await user("usr_no_session", "2026-02-01T00:00:00Z");
    await user("usr_recent_update", "2026-04-01T00:00:00Z");
    await session("usr_recent_update", "2026-03-01T00:00:00Z");
    await user(
      "usr_already_seen",
      "2026-05-01T00:00:00Z",
      "2025-12-01T00:00:00Z",
    );
  },
  verify: async (db) => {
    expect(
      await select(
        db,
        'SELECT "id", "last_seen_at" FROM "users" WHERE "id" IN (\'usr_recent_session\', \'usr_no_session\', \'usr_recent_update\', \'usr_already_seen\') ORDER BY "id"',
      ),
    ).toEqual([
      {
        id: "usr_already_seen",
        last_seen_at: new Date("2025-12-01T00:00:00Z"),
      },
      { id: "usr_no_session", last_seen_at: new Date("2026-02-01T00:00:00Z") },
      {
        id: "usr_recent_session",
        last_seen_at: new Date("2026-03-01T00:00:00Z"),
      },
      {
        id: "usr_recent_update",
        last_seen_at: new Date("2026-04-01T00:00:00Z"),
      },
    ]);
  },
};

const wakefulMadameWeb: Fixture = {
  seed: async (db) => {
    await seedRow(db, "abuse_case_messages", {
      id: "msg_internal",
      visibility: "internal",
    });
    await seedRow(db, "abuse_case_messages", {
      id: "msg_public",
      visibility: "public",
    });
  },
  verify: async (db) => {
    expect(
      await select(
        db,
        'SELECT "id", "audience" FROM "abuse_case_messages" WHERE "id" IN (\'msg_internal\', \'msg_public\') ORDER BY "id"',
      ),
    ).toEqual([
      { id: "msg_internal", audience: "internal" },
      { id: "msg_public", audience: "customer" },
    ]);
  },
};

const ipamClaimAndFractionalTax: Fixture = {
  seed: async (db) => {
    await seedRow(db, "order_items", {
      id: "item_german_vat",
      tax_rate_percentage: 19,
    });
    const subnet = await seedRow(db, "subnets", { id: "net_reallocated" });
    await seedRow(db, "subnet_allocations", {
      subnet_id: subnet.id,
      deallocated_at: new Date("2026-01-01T00:00:00Z"),
    });
    await seedRow(db, "subnet_allocations", { subnet_id: subnet.id });
  },
  verify: async (db) => {
    expect(
      await select(
        db,
        'SELECT "tax_rate_percentage"::text AS "rate" FROM "order_items" WHERE "id" = \'item_german_vat\'',
      ),
    ).toEqual([{ rate: "19.00" }]);
    expect(
      await select(
        db,
        'SELECT count(*)::int AS "allocations" FROM "subnet_allocations" WHERE "subnet_id" = \'net_reallocated\'',
      ),
    ).toEqual([{ allocations: 2 }]);
  },
};

/**
 * The fixture of every migration that moves data, rewrites rows or constrains
 * existing rows, keyed by its folder name. The eight before the gate close
 * risk C26.
 */
export const FIXTURES: Record<string, Fixture> = {
  "20260518122032_round_turbo": roundTurbo,
  "20260728200619_better_auth_account_identity": betterAuthAccountIdentity,
  "20260825113335_templates_as_images": templatesAsImages,
  "20260825125445_node_vm_storage": nodeVmStorage,
  "20260825132222_drop_template_vm_links": dropTemplateVmLinks,
  "20260826122141_inactivity_sweep": inactivitySweep,
  "20260828210454_wakeful_madame_web": wakefulMadameWeb,
  "20260829190953_ipam_claim_and_fractional_tax": ipamClaimAndFractionalTax,
};
