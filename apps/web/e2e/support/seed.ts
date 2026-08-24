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
  mockAdminSession,
  mockDatacenter,
  mockProxmoxNode,
  mockProxmoxNodeGroup,
  mockServer,
  mockServerPlan,
  mockServerPlanPrice,
  mockSession,
} from "@virtbase/api/testing/fixtures";
import { db } from "@virtbase/db/client";
import {
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  serverPlanPrices,
  serverPlans,
  servers,
  users,
} from "@virtbase/db/schema";

/**
 * Seed the fixtures the authenticated E2E projects need, against the real
 * database the app is talking to.
 *
 * Deliberately not `apps/web/scripts/dev/seed.ts`: that one sleeps ten seconds
 * before truncating, generates randomised rows through `drizzle-seed`, and ends
 * in an unconditional `process.exit(0)` that would mask a failure here. E2E
 * needs the opposite of all three - fixed IDs it can assert on, no destructive
 * step, and a thrown error when something goes wrong.
 *
 * Every insert is `onConflictDoNothing`, so running it twice is a no-op and a
 * developer's existing data is never touched.
 */
export async function seedE2eFixtures() {
  await db.insert(users).values(mockSession.user).onConflictDoNothing();
  await db.insert(users).values(mockAdminSession.user).onConflictDoNothing();
  await db.insert(datacenters).values(mockDatacenter).onConflictDoNothing();
  await db
    .insert(proxmoxNodeGroups)
    .values(mockProxmoxNodeGroup)
    .onConflictDoNothing();
  await db.insert(proxmoxNodes).values(mockProxmoxNode).onConflictDoNothing();
  await db.insert(serverPlans).values(mockServerPlan).onConflictDoNothing();
  await db
    .insert(serverPlanPrices)
    .values(mockServerPlanPrice)
    .onConflictDoNothing();
  await db.insert(servers).values(mockServer).onConflictDoNothing();

  return { customer: mockSession.user, admin: mockAdminSession.user };
}
