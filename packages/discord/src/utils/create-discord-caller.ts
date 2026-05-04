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

import { appRouter } from "@virtbase/api";
import { db } from "@virtbase/db/client";
import { createId } from "@virtbase/db/utils";
import type { UserByInteraction } from "./get-user-by-interaction";

export const createDiscordCaller = async ({
  user,
}: {
  user: UserByInteraction | null;
}) => {
  return appRouter.createCaller({
    db,
    authApi: {} as never,
    lexware: null,
    headers: new Headers(),
    setHeader: () => {},
    apiKey: null,
    session: user
      ? {
          session: {
            id: createId({ prefix: "sess_" }),
            token: "__unused_discord_session_token__",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
            updatedAt: new Date(),
            userId: user.id,
          },
          user,
        }
      : null,
  });
};

export type DiscordCaller = Awaited<ReturnType<typeof createDiscordCaller>>;
