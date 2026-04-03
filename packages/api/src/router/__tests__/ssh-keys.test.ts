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

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test";
import { TRPCError } from "@trpc/server";
import { sshKeys, users } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { MAX_SSH_KEYS_PER_USER } from "@virtbase/utils";
import { appRouter } from "../../root";
import { mockSession } from "./fixtures";

let testDb: TestDb;
let caller: ReturnType<typeof appRouter.createCaller>;

beforeAll(async () => {
  testDb = await createTestDb();

  // Create a test user, required for linking ssh keys
  await testDb.insert(users).values(mockSession.user).onConflictDoNothing();

  caller = appRouter.createCaller({
    session: mockSession,
    db: testDb as never,
    authApi: {} as never,
    apiKey: null,
    lexware: null,
    headers: new Headers(),
    setHeader: () => {},
  });
});

afterAll(async () => {
  await testDb.$client.close();
});

afterEach(async () => {
  // Clean database after each test (isolation)
  await testDb.delete(sshKeys);
});

// Generic public key with comment (needs to be sanitzed by the API)
const mockPublicKey =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOwfgos15R2Hml0DLTiYY5oTO2P6mCe6OrfICvE0Kjxz Testing Key";

// Sanitzed public key (without comment)
const sanitizedMockPublicKey =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOwfgos15R2Hml0DLTiYY5oTO2P6mCe6OrfICvE0Kjxz";

// Fingerprint of the mocked public key (matches the sanitized key)
const mockFingerprint = "9b:a0:ba:37:33:01:cf:88:d9:2d:57:db:0d:3a:60:ab";

// Fake ID that passes zod validation but is not a valid SSH key ID
const fakeId = "sshkey_0000000000000000000000000";

describe("sshKeys.create", () => {
  test("it creates a valid SSH key", async () => {
    const created = await caller.sshKeys.create({
      name: "Test Key",
      public_key: mockPublicKey,
    });

    expect(created.ssh_key.id).toStartWith("sshkey_");
    expect(created.ssh_key.name).toBe("Test Key");
    expect(created.ssh_key.public_key).toBe(sanitizedMockPublicKey);
    expect(created.ssh_key.fingerprint).toBe(mockFingerprint);
    expect(created.ssh_key.created_at).toBeInstanceOf(Date);
    expect(created.ssh_key.updated_at).toBeInstanceOf(Date);
  });

  test("it throws a bad request error if the public key is invalid", () => {
    const createPromise = caller.sshKeys.create({
      name: "Test Key",
      public_key: "invalid",
    });

    expect(createPromise).rejects.toThrow(TRPCError);
  });

  test("it throws a too many requests error if the user has reached the maximum number of SSH keys", async () => {
    // Create MAX_SSH_KEYS_PER_USER SSH keys for the test user
    await testDb.insert(sshKeys).values(
      Array.from({ length: MAX_SSH_KEYS_PER_USER }).map((_, i) => ({
        userId: mockSession.user.id,
        name: `Test Key ${i}`,
        publicKey: mockPublicKey,
        fingerprint: mockFingerprint,
      })),
    );

    const createPromise = caller.sshKeys.create({
      name: "Test Key",
      public_key: mockPublicKey,
    });

    expect(createPromise).rejects.toThrow(
      new TRPCError({ code: "TOO_MANY_REQUESTS" }),
    );
  });
});

describe("sshKeys.get", () => {
  test("it throws a not found error if the SSH key does not exist", async () => {
    const getPromise = caller.sshKeys.get({
      id: fakeId,
    });

    expect(getPromise).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));
  });

  test("it gets an existing SSH key", async () => {
    const created = await testDb
      .insert(sshKeys)
      .values({
        userId: mockSession.user.id,
        name: "Test Key",
        publicKey: mockPublicKey,
        fingerprint: mockFingerprint,
      })
      .returning({
        id: sshKeys.id,
        name: sshKeys.name,
        publicKey: sshKeys.publicKey,
        fingerprint: sshKeys.fingerprint,
        createdAt: sshKeys.createdAt,
        updatedAt: sshKeys.updatedAt,
      })
      .then(([row]) => row ?? null);

    if (!created) {
      throw new Error("Failed to create SSH key");
    }

    const get = await caller.sshKeys.get({
      id: created.id,
    });

    expect(get.ssh_key.id).toBe(created.id);
    expect(get.ssh_key.name).toBe(created.name);
    expect(get.ssh_key.public_key).toBe(created.publicKey);
    expect(get.ssh_key.fingerprint).toBe(created.fingerprint);
    expect(get.ssh_key.created_at).toEqual(created.createdAt);
    expect(get.ssh_key.updated_at).toEqual(created.updatedAt);
  });
});

test("sshKeys.list - List SSH keys", async () => {
  await testDb.insert(sshKeys).values([
    {
      userId: mockSession.user.id,
      name: "Test Key #1",
      publicKey: mockPublicKey,
      fingerprint: mockFingerprint,
    },
    {
      userId: mockSession.user.id,
      name: "Test Key #2",
      publicKey: mockPublicKey,
      fingerprint: mockFingerprint,
    },
  ]);

  const list = await caller.sshKeys.list({
    sort: ["name:asc"],
    page: 1,
    per_page: 10,
  });

  expect(list.ssh_keys.length).toBe(2);
  expect(list.ssh_keys[0]?.name).toBe("Test Key #1");
  expect(list.ssh_keys[1]?.name).toBe("Test Key #2");

  expect(list.meta.pagination.page).toBe(1);
  expect(list.meta.pagination.per_page).toBe(10);
  expect(list.meta.pagination.total_entries).toBe(2);
  expect(list.meta.pagination.last_page).toBe(1);
  expect(list.meta.pagination.previous_page).toBeNull();
  expect(list.meta.pagination.next_page).toBeNull();
});

describe("sshKeys.update", () => {
  test("it throws a not found error if the SSH key does not exist", () => {
    const updatePromise = caller.sshKeys.update({
      id: fakeId,
      name: "Updated Name",
    });

    expect(updatePromise).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));
  });

  test("it updates an existing SSH key", async () => {
    const created = await testDb
      .insert(sshKeys)
      .values({
        userId: mockSession.user.id,
        name: "Test Key",
        publicKey: mockPublicKey,
        fingerprint: mockFingerprint,
      })
      .returning({
        id: sshKeys.id,
        name: sshKeys.name,
        publicKey: sshKeys.publicKey,
        fingerprint: sshKeys.fingerprint,
        createdAt: sshKeys.createdAt,
        updatedAt: sshKeys.updatedAt,
      })
      .then(([row]) => row ?? null);

    if (!created) {
      throw new Error("Failed to create SSH key");
    }

    // Set another time so updated_at is guaranteed to differ
    setSystemTime(new Date(Date.now() + 10_000));

    const updated = await caller.sshKeys.update({
      id: created.id,
      name: "Updated Test Key",
    });

    expect(updated.ssh_key.id).toBe(created.id);
    expect(updated.ssh_key.name).toBe("Updated Test Key");
    expect(updated.ssh_key.public_key).toBe(created.publicKey);
    expect(updated.ssh_key.fingerprint).toBe(created.fingerprint);
    expect(updated.ssh_key.created_at).toEqual(created.createdAt);
    expect(updated.ssh_key.updated_at).not.toEqual(created.updatedAt);
  });
});

describe("sshKeys.delete", () => {
  test("it deletes an existing SSH key", async () => {
    const created = await testDb
      .insert(sshKeys)
      .values({
        userId: mockSession.user.id,
        name: "Test Key",
        publicKey: mockPublicKey,
        fingerprint: mockFingerprint,
      })
      .returning({
        id: sshKeys.id,
      })
      .then(([row]) => row ?? null);

    if (!created) {
      throw new Error("Failed to create SSH key");
    }

    const deleted = await caller.sshKeys.delete({
      id: created.id,
    });

    expect(deleted).toBeUndefined();

    const getPromise = caller.sshKeys.get({ id: created.id });
    expect(getPromise).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));
  });

  test("it throws a not found error if the SSH key does not exist", () => {
    const deletePromise = caller.sshKeys.delete({ id: fakeId });
    expect(deletePromise).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));
  });
});
