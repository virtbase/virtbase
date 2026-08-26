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

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import { dataExports } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { mockSession, seedServerGraph } from "../../../testing/fixtures";

let db: TestDb;
let purgeExpiredExports: typeof import("../build").purgeExpiredExports;

const NOW = new Date("2026-08-26T12:00:00.000Z");
const daysFromNow = (days: number) =>
  new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  db = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db }));

  ({ purgeExpiredExports } = await import("../build"));

  await seedServerGraph(db);

  await db.insert(dataExports).values([
    {
      id: "exp_expired_ready",
      userId: mockSession.user.id,
      status: "ready",
      artifact: Buffer.from("an entire dossier"),
      byteSize: 17,
      expiresAt: daysFromNow(-1),
    },
    {
      id: "exp_expired_failed",
      userId: mockSession.user.id,
      status: "failed",
      failureReason: "provider unreachable",
      expiresAt: daysFromNow(-3),
    },
    {
      id: "exp_expired_stuck_building",
      userId: mockSession.user.id,
      status: "building",
      expiresAt: daysFromNow(-2),
    },
    {
      id: "exp_live",
      userId: mockSession.user.id,
      status: "ready",
      artifact: Buffer.from("still within its window"),
      byteSize: 23,
      expiresAt: daysFromNow(5),
    },
  ]);
});

afterAll(async () => {
  await db.$client.close();
});

describe("purgeExpiredExports", () => {
  test("it takes every export past its expiry, whatever state it is in", async () => {
    // A run that failed, or one stuck mid-build, still has a row naming a
    // person - and the stuck one may well have an artifact half-written.
    const purged = await purgeExpiredExports(NOW);

    expect(purged).toBe(3);
  });

  test("it leaves an export that is still within its window", async () => {
    const remaining = await db
      .select({ id: dataExports.id })
      .from(dataExports)
      .where(eq(dataExports.userId, mockSession.user.id));

    expect(remaining.map((row) => row.id)).toEqual(["exp_live"]);
  });

  test("the artifact is gone, not merely the status", async () => {
    // The whole point: an expired row that keeps its bytes has not been
    // purged, it has been relabelled.
    const gone = await db
      .select({ id: dataExports.id })
      .from(dataExports)
      .where(eq(dataExports.id, "exp_expired_ready"));

    expect(gone).toEqual([]);
  });

  test("a second run is a no-op", async () => {
    expect(await purgeExpiredExports(NOW)).toBe(0);
  });
});
