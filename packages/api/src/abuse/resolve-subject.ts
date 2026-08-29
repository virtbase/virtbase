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

import { and, desc, eq, gt, isNull, lte, or, sql } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import {
  orders,
  proxmoxNodes,
  servers,
  subnetAllocations,
  subnets,
  users,
} from "@virtbase/db/schema";
import type { SignalSubject } from "@virtbase/ports";

type Database = typeof database;

export type SignalAttribution =
  | "unattributed"
  | "attributed"
  | "stale"
  | "ambiguous";

export interface ResolvedSubject {
  attribution: SignalAttribution;
  serverId: string | null;
  userId: string | null;
  /**
   * Who holds the address now, when that is somebody else. Only set for
   * `stale`, and only so an operator can see both parties on the case.
   */
  currentServerId: string | null;
}

const UNATTRIBUTED: ResolvedSubject = {
  attribution: "unattributed",
  serverId: null,
  userId: null,
  currentServerId: null,
};

interface Holder {
  serverId: string;
  userId: string;
  /** Prefix length of the subnet that covered the address. Higher is nearer. */
  masklen: number;
}

/**
 * Who held an address at a given moment.
 *
 * There is no per-address table: `subnet_allocations` links a server to a
 * whole `subnets.cidr`, and allocations are released softly with
 * `deallocated_at`. Containment plus a time window is therefore the only way
 * to ask the question, and the most specific subnet wins when ranges nest.
 *
 * Two rows come back so the caller can tell nesting from collision: a /32
 * inside an allocated /24 is normal and the /32 wins, but two live
 * allocations at the same prefix length are an IPAM error rather than an
 * abuse question.
 */
const holdersAt = async (
  db: Database,
  address: string,
  at: Date,
): Promise<Holder[]> =>
  db
    .select({
      serverId: subnetAllocations.serverId,
      userId: servers.userId,
      masklen: sql<number>`masklen(${subnets.cidr})`,
    })
    .from(subnetAllocations)
    .innerJoin(subnets, eq(subnets.id, subnetAllocations.subnetId))
    .innerJoin(servers, eq(servers.id, subnetAllocations.serverId))
    .where(
      and(
        sql`${subnets.cidr} >>= ${address}::inet`,
        lte(subnetAllocations.allocatedAt, at),
        or(
          isNull(subnetAllocations.deallocatedAt),
          gt(subnetAllocations.deallocatedAt, at),
        ),
      ),
    )
    .orderBy(desc(sql`masklen(${subnets.cidr})`))
    .limit(2)
    .then((rows) =>
      rows.flatMap((row) =>
        row.serverId
          ? [
              {
                serverId: row.serverId,
                userId: row.userId,
                masklen: Number(row.masklen),
              },
            ]
          : [],
      ),
    );

/**
 * Turns what a source claimed into a customer, as of when it happened.
 *
 * `occurredAt` is load-bearing rather than decorative. An abuse report arrives
 * hours or days late and addresses get reallocated, so resolving against
 * today's allocation is how an abuse desk suspends the wrong customer. When
 * the holder then and the holder now differ, this says `stale` and names both
 * - and nothing downstream enforces on a `stale` attribution without a human.
 */
export const resolveSignalSubject = async ({
  db,
  subject,
  occurredAt,
}: {
  db: Database;
  subject: SignalSubject;
  occurredAt: Date;
}): Promise<ResolvedSubject> => {
  switch (subject.kind) {
    case "ip":
    case "cidr": {
      // A CIDR is reported as its network address; containment answers both.
      const address = subject.value.split("/")[0] as string;

      const [then, now] = await Promise.all([
        holdersAt(db, address, occurredAt),
        holdersAt(db, address, new Date()),
      ]);

      const holder = then[0];

      // Only a tie is ambiguous. Nesting is ordered by specificity above, so a
      // second row at a wider prefix is the block the winner sits inside.
      if (holder && then[1] && then[1].masklen === holder.masklen) {
        return { ...UNATTRIBUTED, attribution: "ambiguous" };
      }

      if (!holder) {
        // Nobody held it then. If somebody holds it now, that is still not
        // evidence about them - the report is about a moment they were not in.
        return UNATTRIBUTED;
      }

      const current = now[0];
      const stale = !current || current.serverId !== holder.serverId;

      return {
        attribution: stale ? "stale" : "attributed",
        serverId: holder.serverId,
        userId: holder.userId,
        currentServerId: stale ? (current?.serverId ?? null) : null,
      };
    }

    case "vm": {
      const vmid = Number.parseInt(subject.value, 10);
      if (!Number.isSafeInteger(vmid)) return UNATTRIBUTED;

      const server = await db
        .select({ id: servers.id, userId: servers.userId })
        .from(servers)
        .innerJoin(proxmoxNodes, eq(proxmoxNodes.id, servers.proxmoxNodeId))
        .where(
          and(eq(servers.vmid, vmid), eq(proxmoxNodes.hostname, subject.node)),
        )
        .limit(1)
        .then(([first]) => first);

      if (!server) return UNATTRIBUTED;

      return {
        attribution: "attributed",
        serverId: server.id,
        userId: server.userId,
        currentServerId: null,
      };
    }

    case "server": {
      const server = await db
        .select({ id: servers.id, userId: servers.userId })
        .from(servers)
        .where(eq(servers.id, subject.value))
        .limit(1)
        .then(([first]) => first);

      if (!server) return UNATTRIBUTED;

      return {
        attribution: "attributed",
        serverId: server.id,
        userId: server.userId,
        currentServerId: null,
      };
    }

    case "user": {
      const user = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, subject.value))
        .limit(1)
        .then(([first]) => first);

      if (!user) return UNATTRIBUTED;

      return {
        attribution: "attributed",
        serverId: null,
        userId: user.id,
        currentServerId: null,
      };
    }

    case "order": {
      const order = await db
        .select({ userId: orders.userId })
        .from(orders)
        .where(eq(orders.id, subject.value))
        .limit(1)
        .then(([first]) => first);

      if (!order) return UNATTRIBUTED;

      return {
        attribution: "attributed",
        serverId: null,
        userId: order.userId,
        currentServerId: null,
      };
    }

    // A node is ours, not a customer's. The signal is recorded and the
    // operators are told; there is nobody to open a case against.
    default:
      return UNATTRIBUTED;
  }
};
