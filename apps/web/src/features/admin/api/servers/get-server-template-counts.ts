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

import { captureException } from "@sentry/nextjs";
import { count, eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxTemplates as pt, servers } from "@virtbase/db/schema";
import { cacheLife, cacheTag } from "next/cache";
import { verifySession } from "../verify-session";

export async function getServerTemplateCounts() {
  "use cache: private";

  cacheLife("hours");
  cacheTag("server-template-counts", "servers");

  await verifySession();

  try {
    return await db.transaction(
      async (tx) => {
        return tx
          .select({
            id: pt.id,
            icon: pt.icon,
            name: pt.name,
            count: count(),
          })
          .from(servers)
          .innerJoin(pt, eq(servers.proxmoxTemplateId, pt.id))
          .groupBy(pt.id)
          .then((res) =>
            res.reduce(
              (acc, { id, icon, name, count }) => {
                acc[id] = { icon, name, count };
                return acc;
              },
              {} as Record<
                string,
                { icon: string | null; name: string; count: number }
              >,
            ),
          );
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );
  } catch (error) {
    captureException(error);

    return {};
  }
}
