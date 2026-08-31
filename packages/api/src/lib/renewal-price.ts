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

import { and, eq } from "@virtbase/db";
import type { Executor } from "@virtbase/db/client";
import { serverPlanPrices, serverPlans, servers } from "@virtbase/db/schema";

export interface ServerRenewalPrice {
  /** The price row the server is locked to. */
  serverPlanPriceId: string;
  serverPlanId: string;
  /** The plan's name as it reads now, for the order line. */
  planName: string;
  /** What one more term costs, in cents. */
  renewalPrice: number;
}

/**
 * What it costs to keep a server for another term.
 *
 * Lifted out of `checkout.ts`'s `extend_server` branch, unchanged, so that a
 * renewal the system takes on the customer's behalf and an extension the
 * customer clicks are quoted from the same row by the same code. Two
 * implementations of "what does this server cost to renew" is exactly the
 * divergence `lib/pricing.ts` was created to end, and an automatic renewal
 * that charges a different number than the button next to it is a support
 * thread every time.
 *
 * **No discount is evaluated here, and that is deliberate.** `pickBestDiscount`
 * runs when a `server_plan_prices` row is *minted* - at purchase, and again at
 * upgrade - and the result is frozen into `renewalPrice` alongside the
 * `renewalDiscountId` that produced it. The server points at that row for as
 * long as it lives, which is what carries a launch discount into every later
 * renewal. Re-running the discount picker at renewal time would do the
 * opposite: it would re-price existing customers against today's campaigns,
 * silently taking away a discount whose campaign has since ended.
 *
 * Takes an {@link Executor} rather than the client so it can be called from
 * inside a caller's transaction - checkout reads it in a read-only one, the
 * renewal claim reads it under the subscription's row lock.
 *
 * `userId` scopes the lookup to one customer's servers. Checkout passes it as
 * defence in depth behind the authorization it has already done; the renewal
 * path leaves it out, because there the subscription row is the authority on
 * who is being billed.
 */
export const resolveServerRenewalPrice = async (
  executor: Executor,
  { serverId, userId }: { serverId: string; userId?: string },
): Promise<ServerRenewalPrice | null> =>
  executor
    .select({
      serverPlanPriceId: serverPlanPrices.id,
      serverPlanId: serverPlans.id,
      planName: serverPlans.name,
      renewalPrice: serverPlanPrices.renewalPrice,
    })
    .from(servers)
    .innerJoin(
      serverPlanPrices,
      eq(servers.serverPlanPriceId, serverPlanPrices.id),
    )
    .innerJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
    .where(
      and(
        eq(servers.id, serverId),
        ...(userId ? [eq(servers.userId, userId)] : []),
      ),
    )
    .limit(1)
    .then(([row]) => row ?? null);
