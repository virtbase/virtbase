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

import { and, eq, inArray, isNull } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { invoices, orders } from "@virtbase/db/schema";

export interface DeletionBlockers {
  /** Invoices that are neither paid nor cancelled. */
  unpaidInvoices: number;
  /** Orders mid-flight, where erasing would race the fulfilment workflow. */
  openOrders: number;
}

/**
 * Reasons a deletion request is refused, counted so the page can say which.
 *
 * Both are surfaced before the customer commits rather than as an error
 * afterwards, because "you cannot do this" is only useful alongside "here is
 * what to do instead".
 *
 * An unpaid invoice is a lawful ground to refuse under Article 17(3)(e): a
 * debt cannot be pursued against an anonymised record, and erasing the only
 * party to it is not a route to settling it. An open order is simpler - it is
 * a race, and it resolves itself in minutes.
 *
 * Active servers are deliberately *not* a blocker. They are the point of the
 * request: it means destroy them.
 */
export async function getDeletionBlockers({
  db,
  userId,
}: {
  db: typeof database;
  userId: string;
}): Promise<DeletionBlockers> {
  return db.transaction(
    async (tx) => {
      const [unpaidInvoices, openOrders] = await Promise.all([
        tx.$count(
          invoices,
          and(
            eq(invoices.userId, userId),
            isNull(invoices.paidAt),
            isNull(invoices.cancelledAt),
          ),
        ),
        tx.$count(
          orders,
          and(
            eq(orders.userId, userId),
            inArray(orders.status, ["awaiting_payment", "fulfilling"]),
          ),
        ),
      ]);

      return { unpaidInvoices, openOrders };
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );
}

export const hasBlockers = (blockers: DeletionBlockers) =>
  blockers.unpaidInvoices > 0 || blockers.openOrders > 0;
