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
import { servers } from "@virtbase/db/schema";
import { createSubscription } from "../../subscriptions/create-subscription";
import { transitionSubjectSubscription } from "../../subscriptions/subject-subscription";

type CreateServerSubscriptionStepParams = {
  serverId: string;
};

/**
 * Opens the subscription that will one day renew this server.
 *
 * ## This step deliberately changes nothing
 *
 * `autoRenew` is `false` and `mandateAcceptedAt` is null, and **neither is a
 * placeholder waiting to be flipped.** Auto-renewal is a merchant-initiated
 * charge: money taken while the customer is not present. The only thing that
 * makes such a charge defensible - to the customer, and to the provider
 * deciding a dispute - is a record of that customer agreeing, against specific
 * wording, on a specific date, that we may do it. Buying a server is not that
 * agreement. Defaulting `autoRenew` to `true` here would enrol every purchaser
 * into recurring billing as a side effect of a one-off purchase, and every
 * charge that followed would be one the provider reverses on request.
 *
 * The opt-in that records `mandateAcceptedAt` and `mandateTextVersion` is a
 * later wave. Until it exists, this step writes a row that describes the term
 * the customer bought and instructs nothing: `claimRenewal` skips a
 * subscription whose `autoRenew` is false, so nothing downstream can act on
 * it. Its value is that the record exists from the first moment, in step with
 * `terminatesAt`, rather than having to be reconstructed later for every
 * server ever sold.
 *
 * ## Why the dates are read back rather than passed in
 *
 * `storeProvisionedServerStep` writes `installed_at` and `terminates_at` with
 * `now()` and `now() + INTERVAL '1 month'` - server-side, in the same
 * statement. Recomputing either here from a JavaScript clock would put the
 * subscription's period a few milliseconds off the server's own term, and the
 * whole point of the row is that the two agree exactly.
 */
export async function createServerSubscriptionStep({
  serverId,
}: CreateServerSubscriptionStepParams) {
  "use step";

  const server = await db
    .select({
      userId: servers.userId,
      serverPlanPriceId: servers.serverPlanPriceId,
      installedAt: servers.installedAt,
      terminatesAt: servers.terminatesAt,
    })
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1)
    .then(([row]) => row);

  // The workflow only reaches this after `storeProvisionedServerStep`, so a
  // miss here means the row was removed underneath us - a compensation that
  // has already run, or an operator. Nothing to subscribe.
  if (!server?.installedAt || !server.terminatesAt) return { id: null };

  // Safe to call twice: `subscriptions_subject_live_index` refuses a second
  // live subscription for the same subject, and `createSubscription` answers a
  // duplicate with the existing row rather than throwing. A replayed step -
  // one that committed and then lost its acknowledgement - therefore adopts
  // what the first run wrote instead of failing the workflow.
  const subscription = await createSubscription({
    userId: server.userId,
    subjectId: serverId,
    serverPlanPriceId: server.serverPlanPriceId,
    currentPeriodStart: server.installedAt,
    // Not `nextPeriodEnd()`: the term is whatever the server row says it is,
    // and the two must not be computed twice from two clocks.
    currentPeriodEnd: server.terminatesAt,
    // [!] Read the note above before changing either of these.
    autoRenew: false,
    mandateAcceptedAt: null,
    mandateTextVersion: null,
  });

  return { id: subscription.id };
}

/**
 * Closes a subscription whose server never made it.
 *
 * `rollbackStoreProvisionedServerStep` deletes the server row, and
 * `subject_id` is not a foreign key, so without this the failed provision
 * leaves behind a subscription pointing at nothing - the exact state the
 * deletion paths exist to prevent.
 */
export async function rollbackCreateServerSubscriptionStep({
  serverId,
}: CreateServerSubscriptionStepParams) {
  "use step";

  // Keyed on the server rather than on an id captured by the caller, so a
  // replay of the forward step and a replay of this one agree on what to
  // close. `idempotent` inside makes a second run a no-op.
  await transitionSubjectSubscription(serverId, "ended", {
    reason: "provision_failed",
  });
}
