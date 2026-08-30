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
  abuseCaseEvents,
  abuseCaseMessages,
  abuseCaseServers,
  abuseCases,
  abuseSignals,
  notificationDeliveries,
} from "@virtbase/db/schema";
import { FatalError } from "workflow";
import { unplannedErasures } from "./erasure-plan";

type EraseSubjectDataStepParams = {
  userId: string;
};

/**
 * Deletes the subject data that no other step accounts for.
 *
 * Six tables reach this point still holding the customer's data: the abuse
 * case thread they wrote, the servers and operator actions attached to it, the
 * raw inbound reports carrying reporters' identities and IP addresses, and the
 * per-message delivery metadata. All six are declared `erase` in
 * `SUBJECT_DATA`, all six survive a cascade that never fires, and none of them
 * were being deleted anywhere.
 *
 * One transaction: erasure is not a thing to do halfway. The child tables are
 * not named in the deletes - `abuse_cases` cascades to its servers, messages,
 * events and contacts - but they *are* counted first, so the erasure log can
 * say what went rather than what was asked for.
 *
 * [!] This module must export nothing but the step. See `erasure-plan.ts`,
 * which is a separate file for exactly that reason.
 */
export async function eraseSubjectDataStep({
  userId,
}: EraseSubjectDataStepParams) {
  "use step";

  const unplanned = unplannedErasures();
  if (unplanned.length > 0) {
    // Fatal rather than retryable: a redeploy is what fixes this, not a retry.
    throw new FatalError(
      `No erasure is implemented for ${unplanned.join(", ")}. Add it to ERASURE_PLAN before offboarding anyone.`,
    );
  }

  return db.transaction(
    async (tx) => {
      const cases = await tx
        .select({ id: abuseCases.id })
        .from(abuseCases)
        .where(eq(abuseCases.userId, userId));

      const caseIds = cases.map((abuseCase) => abuseCase.id);

      // Counted before the cascade takes them, so the numbers in the erasure
      // log are observations rather than assumptions.
      const [lockedServers, messages, events] = caseIds.length
        ? await Promise.all([
            tx.$count(
              abuseCaseServers,
              inArray(abuseCaseServers.caseId, caseIds),
            ),
            tx.$count(
              abuseCaseMessages,
              inArray(abuseCaseMessages.caseId, caseIds),
            ),
            tx.$count(
              abuseCaseEvents,
              inArray(abuseCaseEvents.caseId, caseIds),
            ),
          ])
        : [0, 0, 0];

      // Signals first: `abuse_signals.case_id` is `set null`, so deleting the
      // cases ahead of them would only cut the link and leave the reports -
      // reporter identity, payload and all - sitting there unattributed.
      const signals = await tx
        .delete(abuseSignals)
        .where(eq(abuseSignals.userId, userId))
        .returning({ id: abuseSignals.id });

      if (caseIds.length > 0) {
        await tx.delete(abuseCases).where(eq(abuseCases.userId, userId));
      }

      const deliveries = await tx
        .delete(notificationDeliveries)
        .where(eq(notificationDeliveries.userId, userId))
        .returning({ id: notificationDeliveries.id });

      return {
        abuseSignals: signals.length,
        abuseCases: caseIds.length,
        abuseCaseServers: lockedServers,
        abuseCaseMessages: messages,
        abuseCaseEvents: events,
        notificationDeliveries: deliveries.length,
      };
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
}
