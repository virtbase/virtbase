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

import { db } from "@virtbase/db/client";
import { erasureLog } from "@virtbase/db/schema";
import { INVOICE_RETENTION_YEARS } from "@virtbase/utils";

type RecordErasureStepParams = {
  userId: string;
  reason: "inactivity" | "user_request" | "admin_request";
  startedAt: string;
  destroyed: Record<string, number>;
  retained: {
    invoices: number;
    orders: number;
    payments: number;
    subscriptions: number;
  };
};

/**
 * Writes the proof that the erasure happened and what it left behind.
 *
 * Carries no personal data by construction - an id, a reason, timestamps and
 * counts - which is what lets it outlive the account it describes. That is the
 * point: it is the Article 5(2) evidence, and evidence that gets erased along
 * with its subject demonstrates nothing.
 */
export async function recordErasureStep({
  userId,
  reason,
  startedAt,
  destroyed,
  retained,
}: RecordErasureStepParams) {
  "use step";

  const untilYear = new Date().getUTCFullYear() + INVOICE_RETENTION_YEARS;

  await db.insert(erasureLog).values({
    userId,
    reason,
    destroyed,
    retained: {
      invoices: {
        count: retained.invoices,
        basis: "statutory-retention",
        untilYear,
      },
      orders: {
        count: retained.orders,
        basis: "statutory-retention",
        untilYear,
      },
      payments: {
        count: retained.payments,
        basis: "statutory-retention",
        untilYear,
      },
      subscriptions: {
        count: retained.subscriptions,
        basis: "statutory-retention",
        untilYear,
      },
    },
    startedAt: new Date(startedAt),
  });
}
