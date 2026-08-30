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
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { subnetAllocations, subnets } from "../../schema";
import type { TestDb } from "../../test-client";
import { createTestDb } from "../../test-client";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});

afterAll(async () => {
  await testDb.$client.close();
});

beforeEach(async () => {
  await testDb.delete(subnetAllocations);
  await testDb.delete(subnets);

  await testDb.insert(subnets).values({
    id: "ipsub_live",
    cidr: "203.0.113.14/32",
    gateway: "203.0.113.1",
  });
});

/**
 * The invariant behind the IPAM race, stated where it cannot be forgotten.
 *
 * Whatever the application does, two customers must never be configured with
 * one address: it breaks networking for both, and it makes every later abuse
 * report about that address unattributable, because point-in-time attribution
 * finds two holders at equal mask length and refuses to guess between them.
 */
describe("subnet_allocations - one live allocation per subnet", () => {
  test("rejects a second live allocation of the same subnet", async () => {
    await testDb
      .insert(subnetAllocations)
      .values({ subnetId: "ipsub_live", description: "first" });

    const second = async () => {
      await testDb
        .insert(subnetAllocations)
        .values({ subnetId: "ipsub_live", description: "second" });
    };

    await expect(second()).rejects.toThrow();
  });

  test("allows a new allocation once the previous one is released", async () => {
    await testDb.insert(subnetAllocations).values({
      subnetId: "ipsub_live",
      description: "released",
      deallocatedAt: new Date(),
    });

    await testDb
      .insert(subnetAllocations)
      .values({ subnetId: "ipsub_live", description: "current" });

    const rows = await testDb.select().from(subnetAllocations);
    expect(rows).toHaveLength(2);
  });

  test("keeps the whole allocation history, not just the live row", async () => {
    // Point-in-time attribution reads released rows, so the index must count
    // only live ones - any number of released allocations is fine.
    for (let i = 0; i < 3; i++) {
      await testDb.insert(subnetAllocations).values({
        subnetId: "ipsub_live",
        description: `old-${i}`,
        deallocatedAt: new Date(),
      });
    }

    const rows = await testDb.select().from(subnetAllocations);
    expect(rows).toHaveLength(3);
  });
});
