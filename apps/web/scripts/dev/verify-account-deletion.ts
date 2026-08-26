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

import { getProxmoxInstance } from "@virtbase/api/proxmox";
import {
  anonymizeUserStep,
  claimAccountStep,
  countRetainedStep,
  destroyGuestStep,
  getServersToDestroyStep,
  purgeIsoDownloadsStep,
  recordErasureStep,
  resetPointerRecordsStep,
  storeServerDeletionStep,
} from "@virtbase/api/workflows";
import { and, eq, isNull } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  erasureLog,
  invoices,
  proxmoxNodes,
  serverPlanPrices,
  serverPlans,
  servers,
  sshKeys,
  subnetAllocations,
  subnets,
  users,
} from "@virtbase/db/schema";

/**
 * Proves account erasure against the real cluster.
 *
 * The unit tests cover the anonymisation transaction with a PGlite database:
 * that the tombstone is unique, that the invoice survives, that the order is
 * stripped. What they cannot cover is the half that only Proxmox can answer -
 * that the guest is genuinely gone from the node rather than merely gone from
 * our table, and that the subnet it held is free again.
 *
 * That asymmetry is the whole risk in this workflow. `servers` cascades from
 * `users`, so the failure mode is not "the deletion errored" but "the row
 * vanished and the VM kept running on somebody's node, billed to nobody".
 *
 *   bun script dev/verify-account-deletion
 *   bun script dev/verify-account-deletion --cleanup
 */
const USER_ID = "usr_00000000000000000000VERIF";
const SERVER_ID = "kvm_00000000000000000000VERIF";
const EMAIL = "verify-account-deletion@example.invalid";
const GUEST_NAME = "verify-account-deletion";

/** How long a `qm destroy` may take on the local cluster. */
const TASK_TIMEOUT_SECONDS = 120;

let failures = 0;

/** Polls until the predicate holds, or gives up. */
async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutSeconds: number,
) {
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return false;
}

const check = (label: string, passed: boolean, detail?: unknown) => {
  console.log(`    ${passed ? "PASS" : "FAIL"}  ${label}`);
  if (detail !== undefined) console.log(`          ${JSON.stringify(detail)}`);
  if (!passed) failures++;
};

async function main() {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    console.log("\n  cleaned up.\n");
    return;
  }

  await cleanup();

  console.log("\n  Verifying account erasure against the local cluster.\n");

  const node = await db
    .select()
    .from(proxmoxNodes)
    .limit(1)
    .then(([row]) => row);

  if (!node) {
    console.error("  No Proxmox node in the database. Run: bun setup:cluster");
    process.exit(1);
  }

  const proxmoxNode = {
    hostname: node.hostname,
    fqdn: node.fqdn,
    tokenID: node.tokenID,
    tokenSecret: node.tokenSecret,
  };

  const instance = getProxmoxInstance(proxmoxNode);

  // ---- seed -------------------------------------------------------------

  const vmid = Number(await instance.cluster.nextid.$get());
  console.log(
    `  Creating guest ${GUEST_NAME} (vmid ${vmid}) on ${node.hostname}...`,
  );

  // A bare VM with no disk. Enough to prove destruction; booting an operating
  // system would only make the script slower without testing anything more.
  await instance.node.qemu.$post({ vmid, name: GUEST_NAME, memory: "512" });

  const plan = await db
    .select()
    .from(serverPlans)
    .limit(1)
    .then(([r]) => r);
  const price = await db
    .select()
    .from(serverPlanPrices)
    .limit(1)
    .then(([r]) => r);

  if (!plan || !price) {
    console.error("  No server plan in the database. Run: bun script dev/seed");
    process.exit(1);
  }

  await db.insert(users).values({
    id: USER_ID,
    name: "Verification User",
    email: EMAIL,
    deletionReason: "user_request",
  });

  await db.insert(servers).values({
    id: SERVER_ID,
    userId: USER_ID,
    serverPlanId: plan.id,
    serverPlanPriceId: price.id,
    proxmoxNodeId: node.id,
    name: GUEST_NAME,
    vmid,
  });

  await db.insert(sshKeys).values({
    userId: USER_ID,
    name: "verification",
    fingerprint: `SHA256:${USER_ID}`,
    publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 verification",
  });

  await db.insert(invoices).values({
    userId: USER_ID,
    lexwareInvoiceId: "deadbeef-0000-4000-8000-000000000001",
    number: "RE-VERIFY-1",
    total: 1000,
    taxAmount: 190,
    reverseCharge: false,
  });

  const subnet = await db
    .select()
    .from(subnets)
    .limit(1)
    .then(([r]) => r);
  if (subnet) {
    await db.insert(subnetAllocations).values({
      subnetId: subnet.id,
      serverId: SERVER_ID,
      description: "verification allocation",
    });
  }

  // ---- run --------------------------------------------------------------

  const startedAt = new Date().toISOString();

  console.log("  Running the offboarding sequence...\n");

  // [!] Driving the steps, not `offboardUserWorkflow` itself.
  //
  // A standalone script cannot run a workflow: `start()` needs the workflow id
  // the build transform attaches, and `sleep()` and `getStepMetadata()` are
  // workflow-VM primitives that throw outside one. `verify-guest-os` drives
  // steps for the same reason.
  //
  // What that costs is the pacing between the stop and the destroy, which is
  // engine behaviour. What it still proves is everything that is new here: the
  // claim, the ordering, the guest actually leaving the node, and the terminal
  // transaction against a real Postgres rather than PGlite.
  const claimed = await claimAccountStep({ userId: USER_ID });
  check(
    "the account is claimed and its identity captured",
    claimed.email === EMAIL,
  );

  const reclaimed = await claimAccountStep({ userId: USER_ID }).catch(
    () => null,
  );
  check("a second run cannot claim the same account", reclaimed === null);

  const toDestroy = await getServersToDestroyStep({ userId: USER_ID });
  check("the server is queued for destruction", toDestroy.length === 1);

  for (const server of toDestroy) {
    const { upid } = await destroyGuestStep({
      proxmoxNode: server.proxmoxNode,
      vmid: server.vmid,
    });

    const finished = await waitFor(async () => {
      const task = await instance.node.tasks.$(upid).status.$get();
      return task.status === "stopped";
    }, TASK_TIMEOUT_SECONDS);

    check("the destroy task finished", finished, { upid });

    await resetPointerRecordsStep({ serverId: server.id });
    await storeServerDeletionStep({ serverId: server.id });
  }

  await purgeIsoDownloadsStep({ userId: USER_ID });
  const retained = await countRetainedStep({ userId: USER_ID });
  const destroyed = await anonymizeUserStep({ userId: USER_ID, email: EMAIL });

  await recordErasureStep({
    userId: USER_ID,
    reason: "user_request",
    startedAt,
    destroyed: { ...destroyed, servers: toDestroy.length },
    retained,
  });

  // ---- assert -----------------------------------------------------------

  console.log("");

  const guests = await instance.node.qemu.$get();
  const stillThere = guests.some((guest) => guest.vmid === vmid);
  check("the guest is gone from the Proxmox node", !stillThere, { vmid });

  const [serverRow] = await db
    .select()
    .from(servers)
    .where(eq(servers.id, SERVER_ID));
  check("the servers row is gone", !serverRow);

  const liveAllocations = await db
    .select()
    .from(subnetAllocations)
    .where(
      and(
        eq(subnetAllocations.serverId, SERVER_ID),
        isNull(subnetAllocations.deallocatedAt),
      ),
    );
  check("the IP allocation is released", liveAllocations.length === 0);

  const [user] = await db.select().from(users).where(eq(users.id, USER_ID));
  check("the user row survives as a tombstone", Boolean(user));
  check(
    "the email address is unrecoverable",
    user?.email === `deleted+${USER_ID}@invalid`,
    user?.email,
  );
  check("it is marked anonymised", Boolean(user?.anonymizedAt));

  const keys = await db
    .select()
    .from(sshKeys)
    .where(eq(sshKeys.userId, USER_ID));
  check("the SSH key is gone", keys.length === 0);

  const kept = await db
    .select()
    .from(invoices)
    .innerJoin(users, eq(invoices.userId, users.id))
    .where(eq(invoices.userId, USER_ID));
  check("the invoice survives and still joins to its user", kept.length === 1);

  const [logged] = await db
    .select()
    .from(erasureLog)
    .where(eq(erasureLog.userId, USER_ID));
  check("an erasure log entry was written", Boolean(logged));
  check(
    "the log carries no personal data",
    !JSON.stringify(logged ?? {}).includes(EMAIL),
  );

  console.log(
    `\n  ${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`,
  );
  console.log("    clean:  bun script dev/verify-account-deletion --cleanup\n");

  process.exit(failures === 0 ? 0 : 1);
}

/**
 * Removes what an earlier run left behind, including the guest itself if the
 * run failed before destroying it.
 */
async function cleanup() {
  const [server] = await db
    .select()
    .from(servers)
    .where(eq(servers.id, SERVER_ID));

  if (server) {
    const [node] = await db
      .select()
      .from(proxmoxNodes)
      .where(eq(proxmoxNodes.id, server.proxmoxNodeId));

    if (node) {
      try {
        const instance = getProxmoxInstance({
          hostname: node.hostname,
          fqdn: node.fqdn,
          tokenID: node.tokenID,
          tokenSecret: node.tokenSecret,
        });
        await instance.node.qemu
          .$(server.vmid)
          .$delete({ purge: true, "destroy-unreferenced-disks": true });
      } catch {
        // Already gone, which is the outcome cleanup wanted anyway.
      }
    }

    await db
      .delete(subnetAllocations)
      .where(eq(subnetAllocations.serverId, SERVER_ID));
    await db.delete(servers).where(eq(servers.id, SERVER_ID));
  }

  await db.delete(erasureLog).where(eq(erasureLog.userId, USER_ID));
  await db.delete(invoices).where(eq(invoices.userId, USER_ID));
  await db.delete(sshKeys).where(eq(sshKeys.userId, USER_ID));
  await db.delete(users).where(eq(users.id, USER_ID));
}

await main();
