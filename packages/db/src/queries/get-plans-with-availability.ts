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

import type { SQL } from "drizzle-orm";
import {
  and,
  asc,
  count,
  eq,
  exists,
  getTableColumns,
  gte,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../client";
import type { DatabaseDiscount } from "../schema";
import {
  discounts,
  discountsToServerPlans,
  proxmoxNodes,
  serverPlans,
  servers,
} from "../schema";

/**
 * Returns server plans together with an `isAvailable` flag indicating
 * whether at least one Proxmox VE node in the plan's group can host a new
 * server of that plan without exceeding any of the node's configured limits
 * (cores, memory, storage, netrate, guest count).
 *
 * The criteria mirror the selection logic used by the provision-server
 * workflow's `selectProxmoxNodeStep` — keep both in sync so a plan that
 * surfaces as available can actually be provisioned.
 *
 * Optional `filters` are applied to the outer `serverPlans` query.
 */
export const getPlansWithAvailability = (...filters: SQL[]) => {
  // The outer query selects from serverPlans, while the EXISTS subquery
  // computes node usage by summing serverPlans rows joined to servers.
  // Aliasing the inner reference keeps the two scopes unambiguous.
  const innerPlan = alias(serverPlans, "inner_plan");

  const usage = db
    .select({
      proxmoxNodeId: servers.proxmoxNodeId,
      serversCount: count(servers.id).as("servers_count"),
      usedCores: sql<number>`COALESCE(SUM(${innerPlan.cores}), 0)`.as(
        "used_cores",
      ),
      usedMemory: sql<number>`COALESCE(SUM(${innerPlan.memory}), 0)`.as(
        "used_memory",
      ),
      usedStorage: sql<number>`COALESCE(SUM(${innerPlan.storage}), 0)`.as(
        "used_storage",
      ),
      usedNetrate: sql<number>`COALESCE(SUM(${innerPlan.netrate}), 0)`.as(
        "used_netrate",
      ),
    })
    .from(servers)
    .innerJoin(innerPlan, eq(servers.serverPlanId, innerPlan.id))
    .groupBy(servers.proxmoxNodeId)
    .as("usage");

  return db
    .select({
      ...getTableColumns(serverPlans),
      // Aggregate the plan's currently-active discounts into a JSON array so
      // a single round-trip can return both the plan and its eligible
      // discounts. Filtered to `active` discounts within the date window so
      // callers can feed the result straight to `pickBestDiscount`.
      //
      // Built via the query builder rather than a raw `sql` literal because
      // Drizzle's `sql` interpolation does not table-qualify `${column}`
      // refs; the correlation back to the outer `server_plans.id` would
      // otherwise collide with the inner `discounts.id` and the subquery
      // would silently return nothing. `eq()` and friends always emit the
      // fully-qualified form, so the correlation is preserved.
      activeDiscounts: sql<
        Pick<
          DatabaseDiscount,
          "id" | "name" | "type" | "amount" | "appliesTo"
        >[]
      >`COALESCE((${db
        .select({
          json: sql`JSON_AGG(JSONB_BUILD_OBJECT(
            'id', ${discounts.id},
            'name', ${discounts.name},
            'type', ${discounts.type},
            'amount', ${discounts.amount},
            'appliesTo', ${discounts.appliesTo}
          ))`,
        })
        .from(discounts)
        .innerJoin(
          discountsToServerPlans,
          eq(discountsToServerPlans.discountId, discounts.id),
        )
        .where(
          and(
            eq(discountsToServerPlans.serverPlanId, serverPlans.id),
            eq(discounts.active, true),
            or(isNull(discounts.startsAt), lte(discounts.startsAt, sql`now()`)),
            or(isNull(discounts.endsAt), gte(discounts.endsAt, sql`now()`)),
          ),
        )}), '[]'::json)`,
      isAvailable: exists(
        db
          .select({ one: sql`1` })
          .from(proxmoxNodes)
          .leftJoin(usage, eq(usage.proxmoxNodeId, proxmoxNodes.id))
          .where(
            and(
              eq(
                proxmoxNodes.proxmoxNodeGroupId,
                serverPlans.proxmoxNodeGroupId,
              ),
              or(
                isNull(proxmoxNodes.coresLimit),
                gte(
                  sql<number>`(${proxmoxNodes.coresLimit} - COALESCE(${usage.usedCores}, 0))`,
                  serverPlans.cores,
                ),
              ),
              or(
                isNull(proxmoxNodes.memoryLimit),
                gte(
                  sql<number>`(${proxmoxNodes.memoryLimit} - COALESCE(${usage.usedMemory}, 0))`,
                  serverPlans.memory,
                ),
              ),
              or(
                isNull(proxmoxNodes.storageLimit),
                gte(
                  sql<number>`(${proxmoxNodes.storageLimit} - COALESCE(${usage.usedStorage}, 0))`,
                  serverPlans.storage,
                ),
              ),
              or(
                isNull(proxmoxNodes.netrateLimit),
                gte(
                  sql<number>`(${proxmoxNodes.netrateLimit} - COALESCE(${usage.usedNetrate}, 0))`,
                  serverPlans.netrate,
                ),
              ),
              or(
                isNull(proxmoxNodes.guestLimit),
                lt(
                  sql<number>`COALESCE(${usage.serversCount}, 0)`,
                  proxmoxNodes.guestLimit,
                ),
              ),
            ),
          ),
      ).mapWith(Boolean),
    })
    .from(serverPlans)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(serverPlans.price));
};
