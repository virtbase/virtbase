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
import { users } from "@virtbase/db/schema";
import { CUSTOMER_ID, prepareFirewallScene } from "./lib/scene";

/**
 * Puts the cluster into the state an episode is filmed in, and stops.
 *
 * Separate from recording on purpose: building the guest takes minutes and
 * recording takes two, so the two are worth failing independently. Run this
 * once, watch the page in a browser, then record as often as the script needs
 * rewriting.
 *
 *   bun script video/prepare
 *   bun script video/prepare --rebuild            (rebuild the guest)
 *   bun script video/prepare --owner=a@b.com      (film as a different account)
 *
 * `--owner` exists because the Ultrademo pipeline signs in with a real email
 * and password, while this one mints a session for a seeded fixture that has
 * neither. Pointing the demo server at whichever account is about to film it
 * keeps both able to see it.
 */
const owner = process.argv
  .find((arg) => arg.startsWith("--owner="))
  ?.slice("--owner=".length);

let userId = CUSTOMER_ID;

if (owner) {
  const [account] = await db
    .select()
    .from(users)
    .where(eq(users.email, owner))
    .limit(1);

  if (!account) {
    throw new Error(
      `no account ${owner} - run \`bun script dev/login\` to create the dev one`,
    );
  }

  userId = account.id;
  console.log(`[scene] filming as ${owner}`);
}

const serverId = await prepareFirewallScene({
  userId,
  rebuild: process.argv.includes("--rebuild"),
});

console.log(
  `\nready: http://app.virtbase.localhost:3000/servers/${serverId}/firewall`,
);
process.exit(0);
