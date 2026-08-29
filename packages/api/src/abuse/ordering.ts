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
import type { db as database } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";

type Database = typeof database;

export interface OrderingBlock {
  blockedAt: Date;
  reason: string | null;
}

/**
 * Whether this customer may place a new order, and why not.
 *
 * Reads the denormalised flag on `users` rather than joining the case tables:
 * checkout asks this on every order, and the authority - a case with
 * `blocks_ordering` - writes both in the same transaction.
 *
 * Deliberately narrow. Renewals, payments and invoices are never blocked: a
 * blocked renewal ends in suspension and then deletion, which is a data-loss
 * penalty applied by side effect and out of all proportion to an open dispute.
 * Only new orders and upgrades are refused, and the block lifts with the case.
 */
export const getOrderingBlock = async ({
  db,
  userId,
}: {
  db: Database;
  userId: string;
}): Promise<OrderingBlock | null> => {
  const row = await db
    .select({
      blockedAt: users.orderingBlockedAt,
      reason: users.orderingBlockReason,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then(([first]) => first);

  if (!row?.blockedAt) return null;

  return { blockedAt: row.blockedAt, reason: row.reason };
};
