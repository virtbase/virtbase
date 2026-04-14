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
import { FatalError } from "workflow";

type GetServerOwnerStepParams = {
  serverId: string;
};

export async function getServerOwnerStep({
  serverId,
}: GetServerOwnerStepParams) {
  "use step";

  const owner = await db.transaction(
    async (tx) => {
      return tx
        .select({
          name: users.name,
          email: users.email,
          locale: users.locale,
        })
        .from(servers)
        .innerJoin(users, eq(servers.userId, users.id))
        .where(eq(servers.id, serverId))
        .limit(1)
        .then(([res]) => res);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!owner) {
    throw new FatalError(
      `The server with ID "${serverId}" was not found. Cannot get server owner.`,
    );
  }

  return owner;
}
