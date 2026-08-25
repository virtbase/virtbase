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
import { and, eq } from "@virtbase/db";
import {
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  proxmoxTemplateGroups,
  proxmoxTemplateImages,
  proxmoxTemplates,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { TEMPLATE_IMAGE_STALE_AFTER_HOURS } from "@virtbase/utils";
import type { ProxmoxInstance } from "../../proxmox";
import {
  mockDatacenter,
  mockProxmoxNode,
  mockProxmoxNodeGroup,
  mockProxmoxTemplate,
  mockProxmoxTemplateGroup,
  mockSession,
} from "../../testing";
import { reconcileTemplateImage } from "../reconcile-template-image";

const STORAGE = mockProxmoxNode.importStorage;
const VOLID = `${STORAGE}:import/${mockProxmoxTemplate.id}-ae204682c015.qcow2`;
const UPID =
  "UPID:node:0000ABCD:00000000:00000000:download:image.qcow2:user@realm!token:";

interface TaskStatus {
  status: string;
  exitstatus?: string;
}

interface StorageEntry {
  volid: string;
  size: number;
}

/**
 * A Proxmox client reduced to the calls reconciliation makes. Each hook may
 * throw to simulate an unreachable node.
 */
const createInstance = ({
  task,
  content = [],
}: {
  task: TaskStatus | (() => never);
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

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

const insertImage = async (
  values: Partial<typeof proxmoxTemplateImages.$inferInsert> = {},
) => {
  await testDb.insert(proxmoxTemplateImages).values({
    proxmoxTemplateId: mockProxmoxTemplate.id,
    proxmoxNodeId: mockProxmoxNode.id,
    storage: STORAGE,
    volid: VOLID,
    upid: UPID,
    createdAt: hoursAgo(0.1),
    ...values,
  });

  return readImage();
};

const readImage = () =>
  testDb
    .select({
      proxmoxTemplateId: proxmoxTemplateImages.proxmoxTemplateId,
      proxmoxNodeId: proxmoxTemplateImages.proxmoxNodeId,
      storage: proxmoxTemplateImages.storage,
      volid: proxmoxTemplateImages.volid,
      upid: proxmoxTemplateImages.upid,
      createdAt: proxmoxTemplateImages.createdAt,
      downloadedAt: proxmoxTemplateImages.downloadedAt,
      failedAt: proxmoxTemplateImages.failedAt,
      lastError: proxmoxTemplateImages.lastError,
      sizeBytes: proxmoxTemplateImages.sizeBytes,
    })
    .from(proxmoxTemplateImages)
    .where(
      and(
        eq(proxmoxTemplateImages.proxmoxTemplateId, mockProxmoxTemplate.id),
        eq(proxmoxTemplateImages.proxmoxNodeId, mockProxmoxNode.id),
        eq(proxmoxTemplateImages.storage, STORAGE),
      ),
    )
    .limit(1)
    // biome-ignore lint/style/noNonNullAssertion: the row is inserted by the test
    .then(([row]) => row!);

const reconcile = (
  image: Awaited<ReturnType<typeof readImage>>,
  instance: ProxmoxInstance,
) =>
  reconcileTemplateImage({
    db: testDb as never,
    instance,
    image,
  });

beforeEach(async () => {
  testDb = await createTestDb();

  await testDb.insert(users).values(mockSession.user);
  await testDb.insert(datacenters).values(mockDatacenter);
  await testDb.insert(proxmoxNodeGroups).values(mockProxmoxNodeGroup);
  await testDb.insert(proxmoxNodes).values(mockProxmoxNode);
  await testDb.insert(proxmoxTemplateGroups).values(mockProxmoxTemplateGroup);
  await testDb.insert(proxmoxTemplates).values(mockProxmoxTemplate);
});

afterEach(async () => {
  await testDb.$client.close();
});

describe("reconcileTemplateImage", () => {
  test("settles a successful download that is present on the storage", async () => {
    const image = await insertImage();

    const result = await reconcile(
      image,
      createInstance({
        task: { status: "stopped", exitstatus: "OK" },
        content: [{ volid: VOLID, size: 436928512 }],
      }),
    );

    expect(result.downloadedAt).not.toBeNull();
    expect(result.failedAt).toBeNull();
    expect(result.sizeBytes).toBe(436928512);

    const row = await readImage();
    expect(row.downloadedAt).not.toBeNull();
    // The task is settled, so the UPID is cleared.
    expect(row.upid).toBeNull();
  });

  test("leaves a running download alone", async () => {
    const image = await insertImage();

    const result = await reconcile(
      image,
      createInstance({ task: { status: "running" } }),
    );

    expect(result.downloadedAt).toBeNull();
    expect(result.failedAt).toBeNull();

    const row = await readImage();
    expect(row.upid).toBe(UPID);
  });

  test("stores Proxmox's checksum mismatch message verbatim", async () => {
    const image = await insertImage();
    const mismatch = "checksum mismatch: got '07e44a73…' != expect 'b58e2d7b…'";

    const result = await reconcile(
      image,
      createInstance({ task: { status: "stopped", exitstatus: mismatch } }),
    );

    expect(result.failedAt).not.toBeNull();
    // The distinction between "vendor repointed the URL" and "host is
    // unreachable" only survives if the message is kept as-is.
    expect(result.lastError).toBe(mismatch);
  });

  test("fails a download that reported OK but left no volume", async () => {
    const image = await insertImage();

    // Proxmox renames from `.tmp_dwnl.<pid>` only on success, so a missing
    // volume here means it was removed - there is nothing to wait for.
    const result = await reconcile(
      image,
      createInstance({
        task: { status: "stopped", exitstatus: "OK" },
        content: [],
      }),
    );

    expect(result.failedAt).not.toBeNull();
    expect(result.downloadedAt).toBeNull();
    expect(result.lastError).toBe("downloaded volume is not on the storage");
  });

  test("keeps a fresh row when the node is unreachable", async () => {
    const image = await insertImage();

    const result = await reconcile(
      image,
      createInstance({ task: unreachable }),
    );

    expect(result.downloadedAt).toBeNull();
    expect(result.failedAt).toBeNull();

    const row = await readImage();
    expect(row.upid).toBe(UPID);
  });

  test("fails a stale row when the node stays unreachable", async () => {
    // An unsettled row makes its template unavailable, so it cannot be left
    // pending forever.
    const image = await insertImage({
      createdAt: hoursAgo(TEMPLATE_IMAGE_STALE_AFTER_HOURS + 1),
    });

    const result = await reconcile(
      image,
      createInstance({ task: unreachable }),
    );

    expect(result.failedAt).not.toBeNull();
    expect(result.lastError).toBe("download task could not be read");
  });

  test("fails a stale row that never recorded a task", async () => {
    const image = await insertImage({
      upid: null,
      createdAt: hoursAgo(TEMPLATE_IMAGE_STALE_AFTER_HOURS + 1),
    });

    const result = await reconcile(
      image,
      createInstance({ task: unreachable }),
    );

    expect(result.failedAt).not.toBeNull();
    expect(result.lastError).toBe("no download task recorded");
  });

  test("keeps a fresh row that has no task yet", async () => {
    const image = await insertImage({ upid: null });

    const result = await reconcile(
      image,
      createInstance({ task: unreachable }),
    );

    expect(result.failedAt).toBeNull();
    expect(result.downloadedAt).toBeNull();
  });

  test("is a no-op on an already settled row", async () => {
    const settledAt = hoursAgo(2);
    const image = await insertImage({
      upid: null,
      downloadedAt: settledAt,
      sizeBytes: 123,
    });

    // Would throw if the task were consulted at all.
    const result = await reconcile(
      image,
      createInstance({ task: unreachable }),
    );

    expect(result.downloadedAt?.getTime()).toBe(settledAt.getTime());
  });

  test("does not overwrite a terminal state set by a concurrent run", async () => {
    const image = await insertImage();

    // Another reconciliation settles the row after we read it but before we
    // write - the first terminal state has to win.
    await testDb
      .update(proxmoxTemplateImages)
      .set({ downloadedAt: hoursAgo(0.05), upid: null })
      .where(
        eq(proxmoxTemplateImages.proxmoxTemplateId, mockProxmoxTemplate.id),
      );

    const result = await reconcile(
      image,
      createInstance({ task: { status: "stopped", exitstatus: "failed" } }),
    );

    expect(result.failedAt).toBeNull();
    expect(result.downloadedAt).not.toBeNull();
  });
});
