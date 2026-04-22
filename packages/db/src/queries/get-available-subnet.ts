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

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../client";
import { subnetAllocations, subnets, subnetsToProxmoxNodes } from "../schema";

// TODO: Improve or cleanup
// Currently unsafe and experimental
export async function findFirstAvailableSubnet(
  family: 4 | 6,
  targetPrefix: number,
  proxmoxNodeId: string,
) {
  return db.transaction(
    async (tx) => {
      const existing = await tx
        .select({
          id: subnets.id,
          cidr: subnets.cidr,
          gateway: subnets.gateway,
          vlan: subnets.vlan,
          bridge: subnetsToProxmoxNodes.bridge,
        })
        .from(subnets)
        .innerJoin(
          subnetsToProxmoxNodes,
          and(
            eq(subnets.id, subnetsToProxmoxNodes.subnetId),
            eq(subnetsToProxmoxNodes.proxmoxNodeId, proxmoxNodeId),
          ),
        )
        .leftJoin(
          subnetAllocations,
          and(
            eq(subnetAllocations.subnetId, subnets.id),
            isNull(subnetAllocations.deallocatedAt),
          ),
        )
        .where(
          and(
            isNull(subnetAllocations.id),
            sql`family(${subnets.cidr}) = ${family}`,
            sql`masklen(${subnets.cidr}) = ${targetPrefix}`,
          ),
        )
        .limit(1)
        .then(([res]) => res);

      if (existing) {
        return existing;
      }

      const parent = await tx
        .select({
          id: subnets.id,
          cidr: subnets.cidr,
          gateway: subnets.gateway,
          vlan: subnets.vlan,
          dnsReverseZone: subnets.dnsReverseZone,
          bridge: subnetsToProxmoxNodes.bridge,
        })
        .from(subnets)
        .innerJoin(
          subnetsToProxmoxNodes,
          and(
            eq(subnets.id, subnetsToProxmoxNodes.subnetId),
            eq(subnetsToProxmoxNodes.proxmoxNodeId, proxmoxNodeId),
          ),
        )
        .leftJoin(
          subnetAllocations,
          and(
            eq(subnetAllocations.subnetId, subnets.id),
            isNull(subnetAllocations.deallocatedAt),
          ),
        )
        .where(
          and(
            isNull(subnetAllocations.id),
            sql`family(${subnets.cidr}) = ${family}`,
            sql`masklen(${subnets.cidr}) < ${targetPrefix}`,
          ),
        )
        .orderBy(desc(sql`masklen(${subnets.cidr})`))
        .limit(1)
        .then(([res]) => res);

      if (!parent) {
        return null;
      }

      const query = sql`
      WITH allocated AS (
        SELECT ${subnets.cidr} AS cidr
        FROM ${subnets}
        WHERE ${subnets.parentId} = ${parent.id}
          AND ${subnets.cidr} <<= ${parent.cidr}::cidr
      ),
      obstacles AS (
        -- actual allocated children
        SELECT cidr FROM allocated

        UNION

        -- when allocating a single host (targetPrefix = family max),
        -- reserve the gateway address if it falls inside the parent
        SELECT set_masklen(${parent.gateway}::inet, ${targetPrefix})::cidr
        WHERE ${targetPrefix} = CASE WHEN ${family} = 4 THEN 32 ELSE 128 END
          AND ${parent.gateway}::inet <<= ${parent.cidr}::cidr

        UNION

        -- for IPv4 /32 allocation, reserve network and broadcast addresses
        SELECT set_masklen(network(${parent.cidr}::inet), 32)::cidr
        WHERE ${family} = 4 AND ${targetPrefix} = 32

        UNION

        SELECT set_masklen(broadcast(${parent.cidr}::inet), 32)::cidr
        WHERE ${family} = 4 AND ${targetPrefix} = 32
      ),
      candidates AS (
        -- first candidate: target prefix at the start of parent
        SELECT set_masklen(${parent.cidr}::inet, ${targetPrefix})::cidr AS subnet

        UNION

        -- for every obstacle, the first target-prefix slot after it
        SELECT set_masklen((broadcast(cidr) + 1)::inet, ${targetPrefix})::cidr AS subnet
        FROM obstacles
        WHERE (broadcast(cidr) + 1)::inet <<= ${parent.cidr}::cidr
      )
      SELECT c.subnet
      FROM candidates c
      WHERE c.subnet <<= ${parent.cidr}::cidr
        AND NOT EXISTS (
          SELECT 1
          FROM obstacles o
          WHERE c.subnet && o.cidr
        )
      ORDER BY c.subnet
      LIMIT 1;
    `;

      const result = await tx
        .execute(query)
        .then((res) => res.rows[0] as { subnet: string } | undefined);
      if (!result?.subnet) {
        return null;
      }

      const insertedSubnet = await tx
        .insert(subnets)
        .values({
          cidr: result.subnet,
          gateway: parent.gateway,
          vlan: parent.vlan,
          dnsReverseZone: parent.dnsReverseZone,
          parentId: parent.id,
        })
        .returning({
          id: subnets.id,
          cidr: subnets.cidr,
          gateway: subnets.gateway,
          vlan: subnets.vlan,
        })
        .then(([res]) => res);

      if (!insertedSubnet) {
        return null;
      }

      await tx.insert(subnetsToProxmoxNodes).values({
        subnetId: insertedSubnet.id,
        proxmoxNodeId,
        bridge: parent.bridge,
      });

      return {
        ...insertedSubnet,
        bridge: parent.bridge,
      };
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
}
