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

import type { OrderStatus } from "@virtbase/db/schema";

/**
 * Which status an order may move to next.
 *
 * Declared as data rather than scattered through `if` statements, so that a
 * webhook arriving late cannot walk an order backwards from `fulfilled` to
 * `paid`, and so the admin console can render the legal actions without
 * duplicating the rules.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["awaiting_payment", "cancelled"],
  // Payment providers can report failure, and customers abandon checkouts.
  awaiting_payment: ["paid", "failed", "cancelled"],
  paid: ["fulfilling", "refunded", "failed"],
  // Fulfilment can be retried, so it may re-enter itself.
  fulfilling: ["fulfilling", "fulfilled", "failed"],
  // Money can still go back after the server exists.
  fulfilled: ["refunded"],
  // A failed order can be retried once the cause is fixed, or refunded if the
  // customer was already charged.
  failed: ["fulfilling", "refunded", "cancelled"],
  cancelled: [],
  refunded: [],
} as const;

export const TERMINAL_ORDER_STATUSES = [
  "cancelled",
  "refunded",
] as const satisfies readonly OrderStatus[];

export const isTerminalOrderStatus = (status: OrderStatus): boolean =>
  (TERMINAL_ORDER_STATUSES as readonly OrderStatus[]).includes(status);

export const canTransitionOrder = (
  from: OrderStatus,
  to: OrderStatus,
): boolean => TRANSITIONS[from].includes(to);

export const nextOrderStatuses = (from: OrderStatus): readonly OrderStatus[] =>
  TRANSITIONS[from];

/**
 * Thrown when something asks for a transition the machine does not allow.
 *
 * Being loud here is deliberate: silently ignoring an illegal transition is how
 * an order ends up in a state nobody can explain.
 */
export class IllegalOrderTransitionError extends Error {
  readonly from: OrderStatus;
  readonly to: OrderStatus;

  constructor(from: OrderStatus, to: OrderStatus) {
    super(`An order cannot move from "${from}" to "${to}".`);
    this.name = "IllegalOrderTransitionError";
    this.from = from;
    this.to = to;
  }
}

export const assertOrderTransition = (
  from: OrderStatus,
  to: OrderStatus,
): void => {
  if (!canTransitionOrder(from, to)) {
    throw new IllegalOrderTransitionError(from, to);
  }
};
