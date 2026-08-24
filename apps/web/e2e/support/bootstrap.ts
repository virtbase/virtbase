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

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { mockAdminSession, mockSession } from "@virtbase/api/testing/fixtures";
import { sessionCookies } from "./auth";
import { seedE2eFixtures } from "./seed";

/**
 * Seed the database and write Playwright storage states.
 *
 * Run as a bun subprocess from `auth.setup.ts`, not imported into the Playwright
 * process. Playwright executes under Node, where `@virtbase/auth` fails to load:
 * it pulls in `@virtbase/email`, which imports its message catalogues as bare
 * `.json` specifiers, and Node's ESM loader demands an import attribute for
 * those. Bun resolves them fine, so the work happens over there and Playwright
 * only ever reads the resulting files.
 */
const STORAGE_STATE = {
  customer: "e2e/.auth/customer.json",
  admin: "e2e/.auth/admin.json",
} as const;

async function writeStorageState(path: string, userId: string) {
  await mkdir(dirname(path), { recursive: true });

  // Playwright's storage state shape. `origins` stays empty: the app keeps no
  // localStorage that a signed-in session depends on.
  await Bun.write(
    path,
    JSON.stringify({ cookies: await sessionCookies(userId), origins: [] }),
  );
}

await seedE2eFixtures();
await writeStorageState(STORAGE_STATE.customer, mockSession.user.id);
await writeStorageState(STORAGE_STATE.admin, mockAdminSession.user.id);

console.log("e2e bootstrap complete");
