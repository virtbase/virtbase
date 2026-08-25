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

import { getPlansWithAvailability } from "@virtbase/db/queries";
import { seedPlansAndNetworking } from "./seed-fixtures";
import { seedProxmoxCluster } from "./seed-proxmox-cluster";

/**
 * Register the local Proxmox cluster with the dev database.
 *
 * Separate from `dev/seed` because that one is not idempotent - it inserts a
 * fresh set of rows and fails on a second run - while re-pointing the database
 * at a rebuilt cluster is something you do often. `bootstrap.sh` mints a new API
 * token whenever the cluster is reset, so this has to be re-runnable on its own.
 */
const nodes = await seedProxmoxCluster();

if (nodes === null) {
  console.error(
    "No cluster found. Start one first:\n" +
      "  docker compose -f tooling/proxmox-cluster/docker-compose.yml up -d\n" +
      "  ./tooling/proxmox-cluster/bootstrap.sh",
  );
  process.exit(1);
}

console.log(`Registered ${nodes} Proxmox node(s) from the local cluster.`);

// Plans and IP space are re-pointed at the same nodes: a rebuilt cluster gets
// new node ids, and links to the old ones are dead weight.
const fixtures = await seedPlansAndNetworking();
console.log(
  `Seeded ${fixtures.plans} plans, ${fixtures.prices} prices, ` +
    `${fixtures.subnets} subnets and ${fixtures.links} subnet/node links.`,
);

// Availability is the thing that actually matters, and it depends on plans,
// nodes and their limits agreeing with each other. Checking it here turns a
// silently useless database into a visible failure.
const plans = await getPlansWithAvailability();
const available = plans.filter((plan) => plan.isAvailable);

if (!available.length) {
  console.error(
    `\n${plans.length} plan(s) seeded but none are available - nothing can be ` +
      "provisioned. Check that the nodes' capacity limits exceed the plans.",
  );
  process.exit(1);
}

console.log(`${available.length}/${plans.length} plans available.`);
process.exit(0);
