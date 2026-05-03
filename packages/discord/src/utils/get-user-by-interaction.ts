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
import { accounts, users } from "@virtbase/db/schema";
import type { APIInteraction } from "discord-api-types/v10";

export const getUserByInteraction = async (interaction: APIInteraction) => {
  let discordAccountId: string | undefined;
  if (interaction.member) {
    // If invoked from a server / guild
    discordAccountId = interaction.member.user.id;
  }

  if (interaction.user) {
    // If invoked from a DM
    discordAccountId = interaction.user.id;
  }

  if (!discordAccountId) {
    throw new Error(
      "[@virtbase/discord] Failed to get the Discord account ID from the interaction.",
    );
  }

  const user = await db.transaction(
    async (tx) => {
      return tx
        .select({
          id: users.id,
          name: users.name,
          locale: users.locale,
        })
        .from(users)
        .innerJoin(accounts, eq(users.id, accounts.userId))
        .where(eq(accounts.accountId, discordAccountId))
        .limit(1)
        .then(([row]) => row);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  return user ?? null;
};

export type UserByInteraction = NonNullable<
  Awaited<ReturnType<typeof getUserByInteraction>>
>;
