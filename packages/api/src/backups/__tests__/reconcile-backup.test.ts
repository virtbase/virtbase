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

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "@virtbase/db";
import {
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  serverBackups,
  serverPlanPrices,
  serverPlans,
  servers,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import {
  BACKUP_ARCHIVE_GRACE_MINUTES,
  BACKUP_STALE_AFTER_HOURS,
} from "@virtbase/utils";
import type { ProxmoxInstance } from "../../proxmox";
import {
  mockDatacenter,
  mockProxmoxNode,
  mockProxmoxNodeGroup,
  mockServer,
  mockServerPlan,
  mockServerPlanPrice,
  mockSession,
} from "../../testing";
import { reconcileServerBackup } from "../reconcile-backup";
import { reconcileServerBackups } from "../reconcile-server-backups";

const BACKUP_ID = "kbu_0000000000000000000000001";
const UPID =
  "UPID:node:0000ABCD:00000000:00000000:vzdump:100:user@realm!token:";
const BACKUP_STORAGE = mockProxmoxNode.backupStorage;

interface TaskStatus {
  status: string;
  exitstatus?: string;
}

interface StorageEntry {
  volid: string;
  size: number;
  ctime?: number;
  notes?: string;
}

/**
 * A Proxmox client reduced to the calls reconciliation makes. Each hook may
 * throw to simulate an unreachable node.
 */
const createInstance = ({
  task,
  log = [],
  content = [],
}: {
  task: TaskStatus | (() => never);
  log?: { t: string }[];
  content?: StorageEntry[] | (() => never);
}) =>
  ({
    node: {
      tasks: {
        $: () => ({
          status: {
            $get: async () =>
              typeof task === "function" ? task() : { ...task },
          },
          log: {
            $get: async () => log,
          },
        }),
      },
      storage: {
        $: () => ({
          content: {
            $get: async () =>
              typeof content === "function" ? content() : [...content],
          },
        }),
      },
    },
  }) as unknown as ProxmoxInstance;

const unreachable = () => {
  throw new Error("proxmox is unreachable");
};

let testDb: TestDb;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const insertBackup = async (
  values: Partial<typeof serverBackups.$inferInsert> = {},
) => {
  await testDb.insert(serverBackups).values({
    id: BACKUP_ID,
    serverId: mockServer.id,
    name: "My backup",
    upid: UPID,
    startedAt: minutesAgo(1),
    ...values,
  });

  return readBackup(values.id ?? BACKUP_ID);
};

const readBackup = (id = BACKUP_ID) =>
  testDb
    .select({
      id: serverBackups.id,
      serverId: serverBackups.serverId,
      upid: serverBackups.upid,
      volid: serverBackups.volid,
      size: serverBackups.size,
      startedAt: serverBackups.startedAt,
      failedAt: serverBackups.failedAt,
      finishedAt: serverBackups.finishedAt,
    })
    .from(serverBackups)
    .where(eq(serverBackups.id, id))
    .limit(1)
    // biome-ignore lint/style/noNonNullAssertion: the row is inserted by the test
    .then(([row]) => row!);

const reconcile = (
  backup: Awaited<ReturnType<typeof readBackup>>,
  instance: ProxmoxInstance,
) =>
  reconcileServerBackup({
    db: testDb as never,
    instance,
    backupStorage: BACKUP_STORAGE,
    vmid: mockServer.vmid,
    backup,
  });

beforeEach(async () => {
  testDb = await createTestDb();

  await testDb.insert(users).values(mockSession.user);
  await testDb.insert(datacenters).values(mockDatacenter);
  await testDb.insert(proxmoxNodeGroups).values(mockProxmoxNodeGroup);
  await testDb.insert(serverPlans).values(mockServerPlan);
  await testDb.insert(serverPlanPrices).values(mockServerPlanPrice);
  await testDb.insert(proxmoxNodes).values(mockProxmoxNode);
  await testDb.insert(servers).values(mockServer);
});

afterEach(async () => {
  await testDb.$client.close();
});

describe("reconcileServerBackup", () => {
  test("stores the archive of a task that finished successfully", async () => {
    const backup = await insertBackup();
    const ctime = Math.floor(Date.now() / 1000);

    const result = await reconcile(
      backup,
      createInstance({
        task: { status: "stopped", exitstatus: "OK" },
        content: [
          {
            volid: "local:backup/vzdump-qemu-100-2026_08_23-00_00_00.vma.zst",
            size: 4096,
            ctime,
            notes: `Created by Virtbase system - backup_id: ${BACKUP_ID}`,
          },
        ],
      }),
    );

    expect(result.finishedAt).toEqual(new Date(ctime * 1000));
    expect(result.failedAt).toBeNull();

    const stored = await readBackup();
    expect(stored.volid).toBe(
      "local:backup/vzdump-qemu-100-2026_08_23-00_00_00.vma.zst",
    );
    expect(stored.size).toBe(4096);
    expect(stored.finishedAt).toEqual(new Date(ctime * 1000));
  });

  test("ignores archives that belong to another backup", async () => {
    const backup = await insertBackup({
      startedAt: minutesAgo(BACKUP_ARCHIVE_GRACE_MINUTES + 1),
    });

    const result = await reconcile(
      backup,
      createInstance({
        task: { status: "stopped", exitstatus: "OK" },
        content: [
          {
            volid: "local:backup/vzdump-qemu-100-2026_08_22-00_00_00.vma.zst",
            size: 4096,
            notes: "Created by Virtbase system - backup_id: kbu_someone_else",
          },
        ],
      }),
    );

    expect(result.failedAt).not.toBeNull();
    expect((await readBackup()).volid).toBeNull();
  });

  test("keeps the archive of a task that finished with warnings", async () => {
    const backup = await insertBackup();

    const result = await reconcile(
      backup,
      createInstance({
        task: { status: "stopped", exitstatus: "WARNINGS: 1" },
        content: [
          {
            volid: "local:backup/vzdump-qemu-100-2026_08_23-00_00_00.vma.zst",
            size: 4096,
            notes: `Created by Virtbase system - backup_id: ${BACKUP_ID}`,
          },
        ],
      }),
    );

    expect(result.failedAt).toBeNull();
    expect((await readBackup()).volid).toBe(
      "local:backup/vzdump-qemu-100-2026_08_23-00_00_00.vma.zst",
    );
  });

  test("marks a task that exited with an error as failed", async () => {
    const backup = await insertBackup();

    const result = await reconcile(
      backup,
      createInstance({
        task: { status: "stopped", exitstatus: "job failed with err -28" },
      }),
    );

    expect(result.failedAt).not.toBeNull();
    expect(result.finishedAt).not.toBeNull();

    const stored = await readBackup();
    expect(stored.failedAt).not.toBeNull();
    expect(stored.finishedAt).not.toBeNull();
  });

  test("reports the progress of a running task without settling it", async () => {
    const backup = await insertBackup();

    const result = await reconcile(
      backup,
      createInstance({
        task: { status: "running" },
        log: [
          { t: "INFO:   3% (385.0 MiB of 10.0 GiB) in 3s" },
          { t: "INFO:  42% (4.2 GiB of 10.0 GiB) in 30s" },
          { t: "INFO: starting new backup job" },
        ],
      }),
    );

    expect(result.percentage).toBe(42);
    expect(result.finishedAt).toBeNull();
    expect((await readBackup()).finishedAt).toBeNull();
  });

  test("fails a task Proxmox still reports as running once it is stale", async () => {
    // A `vzdump` wedged on storage that stopped answering keeps reporting
    // `running` forever. The row it leaves behind is not inert: it blocks every
    // further backup of the server and cannot be deleted, so the customer's
    // backup feature is dead until somebody edits the database. Past the
    // staleness threshold this branch has to settle it like every other.
    const backup = await insertBackup({
      startedAt: minutesAgo(BACKUP_STALE_AFTER_HOURS * 60 + 1),
    });

    const result = await reconcile(
      backup,
      createInstance({
        task: { status: "running" },
        log: [{ t: "INFO:   1% (100.0 MiB of 10.0 GiB) in 3s" }],
      }),
    );

    expect(result.failedAt).not.toBeNull();
    expect(result.finishedAt).not.toBeNull();

    const stored = await readBackup();
    expect(stored.failedAt).not.toBeNull();
    expect(stored.finishedAt).not.toBeNull();
  });

  test("leaves a running task alone until it is stale", async () => {
    // The mirror of the test above: one minute short of the threshold is still
    // a backup in progress, and settling it would throw away a working archive.
    const backup = await insertBackup({
      startedAt: minutesAgo(BACKUP_STALE_AFTER_HOURS * 60 - 1),
    });

    const result = await reconcile(
      backup,
      createInstance({ task: { status: "running" } }),
    );

    expect(result.finishedAt).toBeNull();
    expect((await readBackup()).finishedAt).toBeNull();
  });

  test("survives a log that cannot be read", async () => {
    const backup = await insertBackup();

    const instance = createInstance({ task: { status: "running" } });
    // biome-ignore lint/suspicious/noExplicitAny: narrowing the mock is noise
    (instance.node.tasks as any).$ = () => ({
      status: { $get: async () => ({ status: "running" }) },
      log: { $get: unreachable },
    });

    const result = await reconcile(backup, instance);

    expect(result.percentage).toBeNull();
    expect(result.finishedAt).toBeNull();
  });

  test("keeps a recent backup untouched when the node is unreachable", async () => {
    const backup = await insertBackup();

    const result = await reconcile(
      backup,
      createInstance({ task: unreachable }),
    );

    expect(result.finishedAt).toBeNull();
    expect((await readBackup()).finishedAt).toBeNull();
  });

  test("fails a backup whose task can no longer be resolved", async () => {
    const backup = await insertBackup({
      startedAt: minutesAgo(BACKUP_STALE_AFTER_HOURS * 60 + 1),
    });

    const result = await reconcile(
      backup,
      createInstance({ task: unreachable }),
    );

    expect(result.failedAt).not.toBeNull();
    expect((await readBackup()).failedAt).not.toBeNull();
  });

  test("waits out the grace period before giving up on a missing archive", async () => {
    const backup = await insertBackup({
      startedAt: minutesAgo(BACKUP_ARCHIVE_GRACE_MINUTES - 1),
    });

    const result = await reconcile(
      backup,
      createInstance({
        task: { status: "stopped", exitstatus: "OK" },
        content: [],
      }),
    );

    expect(result.finishedAt).toBeNull();
    expect((await readBackup()).finishedAt).toBeNull();
  });

  test("fails a backup whose archive stays missing", async () => {
    const backup = await insertBackup({
      startedAt: minutesAgo(BACKUP_ARCHIVE_GRACE_MINUTES + 1),
    });

    const result = await reconcile(
      backup,
      createInstance({
        task: { status: "stopped", exitstatus: "OK" },
        content: [],
      }),
    );

    expect(result.failedAt).not.toBeNull();
    expect((await readBackup()).failedAt).not.toBeNull();
  });

  test("never overwrites a backup that is already settled", async () => {
    const finishedAt = minutesAgo(30);
    const backup = await insertBackup({
      startedAt: minutesAgo(60),
      finishedAt,
      volid: "local:backup/vzdump-qemu-100-2026_08_23-00_00_00.vma.zst",
    });

    const result = await reconcile(
      backup,
      createInstance({ task: unreachable }),
    );

    expect(result.finishedAt).toEqual(finishedAt);
    expect(result.failedAt).toBeNull();
  });
});

describe("reconcileServerBackups", () => {
  test("settles every outstanding backup of a server", async () => {
    await insertBackup({ id: "kbu_0000000000000000000000001" });
    await insertBackup({ id: "kbu_0000000000000000000000002" });
    const settled = await insertBackup({
      id: "kbu_0000000000000000000000003",
      finishedAt: minutesAgo(5),
    });

    await reconcileServerBackups({
      db: testDb as never,
      instance: createInstance({
        task: { status: "stopped", exitstatus: "job failed with err -28" },
      }),
      backupStorage: BACKUP_STORAGE,
      vmid: mockServer.vmid,
      serverId: mockServer.id,
    });

    expect(
      (await readBackup("kbu_0000000000000000000000001")).failedAt,
    ).not.toBeNull();
    expect(
      (await readBackup("kbu_0000000000000000000000002")).failedAt,
    ).not.toBeNull();
    // Untouched - it was already settled
    expect(
      (await readBackup("kbu_0000000000000000000000003")).finishedAt,
    ).toEqual(settled.finishedAt as Date);
  });
});
