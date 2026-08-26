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

import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { servers, users } from "@virtbase/db/schema";
import { auth } from "@/lib/auth/server";

/**
 * Signs a development account in and prints its session cookie.
 *
 * Local sign-up requires a verified email, and the seeded fixtures have no
 * password account at all, so there is no way to reach the dashboard in a
 * browser without either an inbox or this. Verification is set directly rather
 * than followed through the emailed link - the link only exists in the dev
 * server's console, which a script cannot read.
 *
 *   bun script dev/login
 *   bun script dev/login --claim-servers   (move every server to this account)
 *   bun script dev/login --admin           (grant the admin console)
 */
const EMAIL = "dev@example.com";
const PASSWORD = "devpassword123";

async function main() {
  let [user] = await db.select().from(users).where(eq(users.email, EMAIL));

  if (!user) {
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: "Dev" },
    });
    [user] = await db.select().from(users).where(eq(users.email, EMAIL));
  }

  if (!user) throw new Error("sign-up did not create a user");

  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, user.id));

  if (process.argv.includes("--admin")) {
    await db.update(users).set({ role: "ADMIN" }).where(eq(users.id, user.id));
    console.error("[login] this account can now reach the admin console");
  }

  if (process.argv.includes("--claim-servers")) {
    await db.update(servers).set({ userId: user.id });
    console.error("[login] every server now belongs to this account");
  }

  const response = await auth.api.signInEmail({
    body: { email: EMAIL, password: PASSWORD },
    asResponse: true,
  });

  const cookies = response.headers.getSetCookie();
  if (cookies.length === 0) throw new Error("sign-in returned no cookies");

  console.error(`[login] ${EMAIL} / ${PASSWORD} -> ${user.id}`);
  // Only the name=value pairs, so the caller can hand them straight to a
  // browser context without parsing attributes.
  if (process.argv.includes("--raw")) {
    for (const cookie of cookies) console.error(`[login] raw: ${cookie}`);
  }

  console.log(cookies.map((cookie) => cookie.split(";")[0]).join("; "));
}

await main();
