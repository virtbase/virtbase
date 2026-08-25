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

import { db } from "@virtbase/db/client";
import {
  datacenters,
  proxmoxNodeGroups,
  proxmoxTemplateGroups,
  serverPlans,
  users,
} from "@virtbase/db/schema";
import { createId } from "@virtbase/db/utils";
import { sleep } from "bun";
import { reset, seed } from "drizzle-seed";
import { seedPlansAndNetworking } from "./seed-fixtures";
import { seedProxmoxCluster } from "./seed-proxmox-cluster";

const schema = {
  datacenters,
  proxmoxNodeGroups,
  proxmoxTemplateGroups,
  users,
  serverPlans,
} as const;

async function main() {
  const shouldTruncate = process.argv.slice(2).includes("--truncate");

  if (shouldTruncate) {
    console.log("\n⚠️  WARNING: This will delete ALL data from the database.\n");
    console.log("⚠️  Make sure you are NOT on production database!\n");
    console.log("You have 10 seconds to cancel by pressing Ctrl+C\n");

    await sleep(10_000);

    console.log("\n");
    await reset(db, schema);
    console.log("\n");
  }

  await seed(db, schema).refine((f) => ({
    datacenters: {
      count: 3,
      columns: {
        id: f.valuesFromArray({
          values: Array.from({ length: 3 }, () => createId({ prefix: "dc_" })),
          isUnique: true,
        }),
        name: f.valuesFromArray({
          values: ["Skylink Data Center", "Maincubes FRA1", "Interwerk"],
          isUnique: true,
        }),
        country: f.valuesFromArray({
          values: ["NL", "DE", "DE"],
        }),
      },
    },
    proxmoxNodeGroups: {
      count: 3,
      columns: {
        id: f.valuesFromArray({
          values: Array.from({ length: 3 }, () => createId({ prefix: "png_" })),
          isUnique: true,
        }),
        name: f.valuesFromArray({
          values: [
            "Skylink EPYC 7443P",
            "Maincubes EPYC 7443P",
            "Interwerk EPYC 7443P",
          ],
          isUnique: true,
        }),
        strategy: f.valuesFromArray({
          values: ["RANDOM", "ROUND_ROBIN", "LEAST_USED", "FILL"],
        }),
      },
    },
    proxmoxTemplateGroups: {
      count: 5,
      columns: {
        id: f.valuesFromArray({
          values: Array.from({ length: 5 }, () => createId({ prefix: "ptg_" })),
          isUnique: true,
        }),
        name: f.valuesFromArray({
          values: ["Debian", "Ubuntu", "CentOS", "Fedora", "AlmaLinux"],
          isUnique: true,
        }),
        priority: f.default({ defaultValue: 0 }),
      },
    },
    users: {
      count: 1,
      columns: {
        id: f.default({ defaultValue: createId({ prefix: "usr_" }) }),
        name: f.default({ defaultValue: "Admin" }),
        email: f.default({ defaultValue: "admin@example.com" }),
        emailVerified: f.default({ defaultValue: true }),
        locale: f.default({ defaultValue: "en" }),
        role: f.default({ defaultValue: "ADMIN" }),
      },
    },
  }));

  // Register the local Proxmox cluster if one has been bootstrapped. Without
  // real nodes the seeded plans are never "available" and nothing can be
  // provisioned, so the dev database looks populated but does not work.
  const nodes = await seedProxmoxCluster();

  // Plans, prices and IP space are inserted explicitly rather than generated:
  // they must line up with the nodes above and with the exact prefix lengths
  // provisioning asks for, which drizzle-seed has no way to express.
  if (nodes !== null) {
    const fixtures = await seedPlansAndNetworking();
    console.log(
      `\nSeeded ${fixtures.plans} plans, ${fixtures.subnets} subnets and ` +
        `${fixtures.links} subnet/node links.`,
    );
  }
  console.log(
    nodes === null
      ? "\nNo Proxmox cluster found. Start one with:\n  docker compose -f tooling/proxmox-cluster/docker-compose.yml up -d\n  ./tooling/proxmox-cluster/bootstrap.sh\n"
      : `\nRegistered ${nodes} Proxmox node(s) from the local cluster.\n`,
  );

  process.exit(0);
}

void main();
