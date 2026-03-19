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

import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { invoices, users } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { LexwareClient } from "../../lexware/client";
import { appRouter } from "../../root";
import { mockSession } from "./fixtures";

let testDb: TestDb;
let caller: ReturnType<typeof appRouter.createCaller>;
let unauthenticatedCaller: ReturnType<typeof appRouter.createCaller>;
let unconfiguredLexwareCaller: ReturnType<typeof appRouter.createCaller>;

// Fake ID that passes zod validation but is not a valid invoice ID
const fakeId = "inv_0000000000000000000000000";

const mockInvoice = {
  userId: mockSession.user.id,
  number: "RE-2026-0001",
  total: 119,
  taxAmount: 19,
  reverseCharge: false,
  lexwareInvoiceId: "b2df5c0d-0340-42a7-9d47-cbc0a7460b8e",
};

const mockLexwareClient = new LexwareClient("mock-api-key");

beforeAll(async () => {
  testDb = await createTestDb();

  // Create a test user, required for linking invoices
  await testDb.insert(users).values(mockSession.user).onConflictDoNothing();

  const sharedContext = {
    db: testDb as never,
    authApi: {} as never,
    apiKey: null,
    headers: new Headers(),
    setHeader: () => {},
  };

  caller = appRouter.createCaller({
    ...sharedContext,
    session: mockSession,
    lexware: mockLexwareClient,
  });

  unauthenticatedCaller = appRouter.createCaller({
    ...sharedContext,
    session: null,
    lexware: mockLexwareClient,
  });

  unconfiguredLexwareCaller = appRouter.createCaller({
    ...sharedContext,
    session: mockSession,
    lexware: null,
  });
});

afterEach(async () => {
  // Clean database after each test (isolation)
  await testDb.delete(invoices);
});

describe("invoices.get", () => {
  test("it throws an unauthorized error if the user is not authenticated", async () => {
    const getPromise = unauthenticatedCaller.invoices.get({
      id: fakeId,
    });

    expect(getPromise).rejects.toThrow(
      new TRPCError({
        code: "UNAUTHORIZED",
      }),
    );
  });

  test("it throws a not found error if the invoice does not exist", async () => {
    const getPromise = caller.invoices.get({
      id: fakeId,
    });

    expect(getPromise).rejects.toThrow(TRPCError);
  });

  test("it gets an existing invoice", async () => {
    const created = await testDb
      .insert(invoices)
      .values(mockInvoice)
      .returning()
      .then(([row]) => row ?? null);

    if (!created) {
      throw new Error("Failed to create invoice");
    }

    const get = await caller.invoices.get({
      id: created.id,
    });

    expect(get.invoice.id).toBe(created.id);
    expect(get.invoice.number).toBe(created.number);
    expect(get.invoice.total).toBe(created.total);
    expect(get.invoice.tax_amount).toBe(created.taxAmount);
    expect(get.invoice.reverse_charge).toBe(created.reverseCharge);
    expect(get.invoice.cancelled_at).toBe(created.cancelledAt);
    expect(get.invoice.paid_at).toBe(created.paidAt);
    expect(get.invoice.sent_at).toBe(created.sentAt);
    expect(get.invoice.created_at).toEqual(created.createdAt);
    expect(get.invoice.updated_at).toEqual(created.updatedAt);
  });
});

describe("invoices.list", () => {
  test("it throws an unauthorized error if the user is not authenticated", async () => {
    const listPromise = unauthenticatedCaller.invoices.list({
      sort: ["number:asc"],
      page: 1,
      per_page: 10,
    });

    expect(listPromise).rejects.toThrow(
      new TRPCError({
        code: "UNAUTHORIZED",
      }),
    );
  });

  test("it returns a paginated list of invoices", async () => {
    await testDb.insert(invoices).values([
      {
        ...mockInvoice,
        number: "RE-2026-0001",
      },
      {
        ...mockInvoice,
        number: "RE-2026-0002",
      },
    ]);

    const list = await caller.invoices.list({
      sort: ["number:asc"],
      page: 1,
      per_page: 10,
    });

    expect(list.invoices.length).toBe(2);
    expect(list.invoices[0]?.number).toBe("RE-2026-0001");
    expect(list.invoices[1]?.number).toBe("RE-2026-0002");

    expect(list.meta.pagination.page).toBe(1);
    expect(list.meta.pagination.per_page).toBe(10);
    expect(list.meta.pagination.total_entries).toBe(2);
    expect(list.meta.pagination.last_page).toBe(1);
    expect(list.meta.pagination.previous_page).toBeNull();
    expect(list.meta.pagination.next_page).toBeNull();
  });
});

describe("invoices.download", () => {
  test("it throws an unauthorized error if the user is not authenticated", async () => {
    const downloadPromise = unauthenticatedCaller.invoices.download({
      id: fakeId,
    });

    expect(downloadPromise).rejects.toThrow(
      new TRPCError({
        code: "UNAUTHORIZED",
      }),
    );
  });

  test("it throws a not found error if the invoice does not exist", async () => {
    const downloadPromise = caller.invoices.download({
      id: fakeId,
    });

    expect(downloadPromise).rejects.toThrow(
      new TRPCError({
        code: "NOT_FOUND",
      }),
    );
  });

  test("it throws a internal server error if the lexware client is not configured", async () => {
    const created = await testDb
      .insert(invoices)
      .values(mockInvoice)
      .returning()
      .then(([row]) => row ?? null);

    if (!created) {
      throw new Error("Failed to create invoice");
    }

    const downloadPromise = unconfiguredLexwareCaller.invoices.download({
      id: created.id,
    });

    expect(downloadPromise).rejects.toThrow(
      new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
      }),
    );
  });

  test("it downloads an existing invoice if the lexware client is configured", async () => {
    const created = await testDb
      .insert(invoices)
      .values(mockInvoice)
      .returning()
      .then(([row]) => row ?? null);

    if (!created) {
      throw new Error("Failed to create invoice");
    }

    const spy = spyOn(
      LexwareClient.prototype,
      "downloadInvoice",
    ).mockResolvedValue(new ArrayBuffer(8));

    const download = await caller.invoices.download({
      id: created.id,
    });

    expect(spy).toHaveBeenCalledWith(created.lexwareInvoiceId);

    expect(download.filename).toBe(`${created.lexwareInvoiceId}.pdf`);
    expect(download.content_type).toBe("application/pdf");
    expect(download.content).toBeDefined();
    expect(download.content).toBe(
      Buffer.from(new ArrayBuffer(8)).toString("base64url"),
    );
  });
});
