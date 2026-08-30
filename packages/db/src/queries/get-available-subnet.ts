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

import { and, asc, desc, eq, isNull, notExists, or, sql } from "drizzle-orm";
import { db } from "../client";
import { subnetAllocations, subnets, subnetsToProxmoxNodes } from "../schema";

/**
 * How long a subnet is held for the caller before it returns to the pool.
 *
 * The caller does not write its `subnet_allocations` row here - it writes it
 * once the server exists, after the clone, the disk resize, the cloud-init
 * upload and the network config. This window has to comfortably outlast that,
 * because losing a reservation mid-provision is worse than holding an address
 * for an hour: the winner would take the address and the original run would
 * fail at its insert.
 *
 * It is a ceiling, not a schedule. A run that finishes writes its allocation
 * and the reservation stops mattering; a run that dies leaves the address to
 * expire on its own, so there is nothing to reap.
 */
export const SUBNET_RESERVATION_MINUTES = 60;

/**
 * How many times a carve is retried when another caller took the address
 * first.
 *
 * Two callers under the same parent compute the same next free address, and
 * `subnets.cidr` is unique, so exactly one wins. The loser re-reads the
 * obstacles - which now include the winner's row - and computes the next one
 * down. Bounded, because a caller that loses this often is contending with
 * more concurrent provisions than the parent has space for.
 */
const CARVE_ATTEMPTS = 5;

/** Sentinel: this attempt lost a race and the caller should try again. */
const RETRY = Symbol("retry");

const reservationExpiry = sql`now() + ${sql.raw(`INTERVAL '${SUBNET_RESERVATION_MINUTES} minutes'`)}`;

/**
 * Finds a subnet that nobody holds, and claims it in the same transaction.
 *
 * Selecting and claiming used to be separate: this returned a subnet id having
 * written nothing, and the allocation row appeared minutes later, at the end of
 * provisioning. Two concurrent provisions were therefore handed the same
 * address - reliably, because the query had no `ORDER BY` and no lock - and two
 * customers ended up configured with one IP.
 *
 * The claim is `subnets.reserved_until`. It is advisory: what actually forbids
 * two live allocations of one subnet is the partial unique index on
 * `subnet_allocations (subnet_id) WHERE deallocated_at IS NULL`. That ordering
 * matters - if a reservation ever does expire under a run that is still going,
 * the run fails at its insert instead of quietly duplicating an address.
 */
export async function findFirstAvailableSubnet(
  family: 4 | 6,
  targetPrefix: number,
  proxmoxNodeId: string,
) {
  for (let attempt = 0; attempt < CARVE_ATTEMPTS; attempt++) {
    const result = await claimFirstAvailableSubnet(
      family,
      targetPrefix,
      proxmoxNodeId,
    );

    if (result !== RETRY) {
      return result;
    }
  }

  return null;
}

async function claimFirstAvailableSubnet(
  family: 4 | 6,
  targetPrefix: number,
  proxmoxNodeId: string,
) {
  return db.transaction(
    async (tx) => {
      /** A subnet nobody holds: no live allocation and no live reservation. */
      const isUnheld = and(
        notExists(
          tx
            .select({ one: sql`1` })
            .from(subnetAllocations)
            .where(
              and(
                eq(subnetAllocations.subnetId, subnets.id),
                isNull(subnetAllocations.deallocatedAt),
              ),
            ),
        ),
        or(
          isNull(subnets.reservedUntil),
          sql`${subnets.reservedUntil} <= now()`,
        ),
      );

      // `skip locked` is what makes this safe: a second caller arriving while
      // this row is locked moves straight past it rather than waiting for it
      // and then being handed the same subnet. The `order by` is what makes it
      // deterministic - without one, every caller raced for whichever row the
      // planner happened to return first.
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
        .where(
          and(
            isUnheld,
            sql`family(${subnets.cidr}) = ${family}`,
            sql`masklen(${subnets.cidr}) = ${targetPrefix}`,
          ),
        )
        .orderBy(asc(subnets.cidr))
        .limit(1)
        .for("update", { of: subnets, skipLocked: true })
        .then(([res]) => res);

      if (existing) {
        await tx
          .update(subnets)
          .set({ reservedUntil: reservationExpiry })
          .where(eq(subnets.id, existing.id));

        return existing;
      }

      // A held subnet is not a candidate parent either: a reserved /64 belongs
      // to a provisioning run, and carving a /128 out of it would hand away
      // part of an address somebody is already being given.
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
        .where(
          and(
            isUnheld,
            sql`family(${subnets.cidr}) = ${family}`,
            sql`masklen(${subnets.cidr}) < ${targetPrefix}`,
          ),
        )
        .orderBy(desc(sql`masklen(${subnets.cidr})`), asc(subnets.cidr))
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

      // The carved subnet is reserved as it is created. Without that, a caller
      // arriving a moment later would find a brand-new child with no
      // allocation against it and hand out the same address again.
      const insertedSubnet = await tx
        .insert(subnets)
        .values({
          cidr: result.subnet,
          gateway: parent.gateway,
          vlan: parent.vlan,
          dnsReverseZone: parent.dnsReverseZone,
          parentId: parent.id,
          reservedUntil: reservationExpiry,
        })
        // `subnets.cidr` is unique, so a concurrent carve of the same address
        // lands here rather than throwing. Nothing inserted means somebody
        // else took it; the retry sees their row as an obstacle.
        .onConflictDoNothing()
        .returning({
          id: subnets.id,
          cidr: subnets.cidr,
          gateway: subnets.gateway,
          vlan: subnets.vlan,
        })
        .then(([res]) => res);

      if (!insertedSubnet) {
        return RETRY;
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
