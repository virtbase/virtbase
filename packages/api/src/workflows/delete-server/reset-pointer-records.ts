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

import { eq, inArray } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  pointerRecords,
  subnetAllocations,
  subnets,
} from "@virtbase/db/schema";

type ResetPointerRecordsStepParams = {
  serverId: string;
};

export async function resetPointerRecordsStep({
  serverId,
}: ResetPointerRecordsStepParams) {
  "use step";

  // Loaded here rather than imported: `integrations` is a module-level
  // const inside an import cycle, and a static import of it from a step
  // module can be evaluated while that module is still initialising -
  // which fails the whole step bundle with a TDZ error, not just this
  // step. `notifications/dispatch.ts` breaks the same cycle the same way.
  const { integrations } = await import("../../integrations");
  const dns = await integrations.resolve("dns");
  if (!dns) {
    console.warn(
      "No DNS provider is configured, skipping pointer record reset",
    );
    return;
  }

  await db.transaction(
    async (tx) => {
      const records = await tx
        .select({
          id: pointerRecords.id,
          ip: pointerRecords.ip,
          zone: subnets.dnsReverseZone,
        })
        .from(pointerRecords)
        .innerJoin(
          subnetAllocations,
          eq(pointerRecords.subnetAllocationId, subnetAllocations.id),
        )
        .innerJoin(subnets, eq(subnetAllocations.subnetId, subnets.id))
        .where(eq(subnetAllocations.serverId, serverId));

      if (0 === records.length) {
        return;
      }

      const groupedByZone = records.reduce(
        (acc, record) => {
          const { zone } = record;
          if (!zone) return acc;
          if (!acc[zone]) acc[zone] = [];
          acc[zone].push(record);
          return acc;
        },
        {} as Record<string, typeof records>,
      );

      await Promise.all(
        Object.entries(groupedByZone).map(async ([zone, records]) => {
          await dns.deletePointerRecords({
            zone,
            ips: records.map((record) => record.ip),
          });
        }),
      );

      await tx.delete(pointerRecords).where(
        inArray(
          pointerRecords.id,
          records.map((record) => record.id),
        ),
      );
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
}
