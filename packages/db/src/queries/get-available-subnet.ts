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
      WITH RECURSIVE candidates AS (
        -- first candidate: target prefix at the start of parent
        SELECT set_masklen(${parent.cidr}::inet, ${targetPrefix})::cidr AS subnet
  
        UNION ALL
  
        -- next candidate: broadcast(subnet) + 1
        SELECT set_masklen((broadcast(subnet) + 1)::inet, ${targetPrefix})::cidr
        FROM candidates
        WHERE set_masklen((broadcast(subnet) + 1)::inet, ${targetPrefix}) <<= ${parent.cidr}::inet
      )
      SELECT c.subnet
      FROM candidates c
      LEFT JOIN ${subnets} existing
        ON existing.parent_id = ${parent.id}
        AND existing.cidr = c.subnet
      WHERE existing.id IS NULL
        AND (
          ${targetPrefix} != CASE WHEN ${family} = 4 THEN 32 ELSE 128 END
          OR (
            (${family} != 4 OR (
              c.subnet::inet <> network(${parent.cidr}::inet)
              AND c.subnet::inet <> broadcast(${parent.cidr}::inet)
            ))
            AND (
              ${parent.gateway} IS NULL
              OR c.subnet <> set_masklen(${parent.gateway}::inet, ${targetPrefix})::cidr
            )
          )
        )
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
