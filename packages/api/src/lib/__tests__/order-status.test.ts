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

import { describe, expect, test } from "bun:test";
import type { OrderStatus } from "@virtbase/db/schema";
import {
  assertOrderTransition,
  canTransitionOrder,
  IllegalOrderTransitionError,
  isTerminalOrderStatus,
  nextOrderStatuses,
} from "../order-status";

const ALL: OrderStatus[] = [
  "draft",
  "awaiting_payment",
  "paid",
  "fulfilling",
  "fulfilled",
  "failed",
  "cancelled",
  "refunded",
];

describe("the happy path", () => {
  test("walks draft to fulfilled", () => {
    const path: OrderStatus[] = [
      "draft",
      "awaiting_payment",
      "paid",
      "fulfilling",
      "fulfilled",
    ];

    for (let i = 0; i < path.length - 1; i++) {
      expect(
        canTransitionOrder(path[i] as OrderStatus, path[i + 1] as OrderStatus),
      ).toBe(true);
    }
  });
});

describe("orders cannot move backwards", () => {
  test("a late webhook cannot undo fulfilment", () => {
    // Providers retry and deliver out of order; this is the case that would
    // otherwise re-provision a server.
    expect(canTransitionOrder("fulfilled", "paid")).toBe(false);
    expect(canTransitionOrder("fulfilled", "fulfilling")).toBe(false);
    expect(canTransitionOrder("paid", "awaiting_payment")).toBe(false);
  });

  test("payment cannot be skipped", () => {
    expect(canTransitionOrder("draft", "paid")).toBe(false);
    expect(canTransitionOrder("draft", "fulfilling")).toBe(false);
    expect(canTransitionOrder("awaiting_payment", "fulfilled")).toBe(false);
  });
});

describe("terminal states", () => {
  test("nothing leaves cancelled or refunded", () => {
    for (const status of ALL) {
      expect(canTransitionOrder("cancelled", status)).toBe(false);
      expect(canTransitionOrder("refunded", status)).toBe(false);
    }
  });

  test("reports which states are terminal", () => {
    expect(isTerminalOrderStatus("cancelled")).toBe(true);
    expect(isTerminalOrderStatus("refunded")).toBe(true);
    expect(isTerminalOrderStatus("fulfilled")).toBe(false);
    // `failed` is not terminal: it can be retried or refunded.
    expect(isTerminalOrderStatus("failed")).toBe(false);
  });
});

describe("recovery", () => {
  test("fulfilment can be retried", () => {
    expect(canTransitionOrder("fulfilling", "fulfilling")).toBe(true);
    expect(canTransitionOrder("failed", "fulfilling")).toBe(true);
  });

  test("a paid order can always be refunded", () => {
    for (const status of [
      "paid",
      "fulfilling",
      "fulfilled",
      "failed",
    ] as const) {
      const reachable = nextOrderStatuses(status);
      if (status === "fulfilling") {
        // Refunding mid-fulfilment would race the workflow; it has to fail or
        // finish first.
        expect(reachable).not.toContain("refunded");
      } else {
        expect(reachable).toContain("refunded");
      }
    }
  });
});

describe("assertOrderTransition", () => {
  test("passes a legal transition", () => {
    expect(() => assertOrderTransition("paid", "fulfilling")).not.toThrow();
  });

  test("throws on an illegal one rather than ignoring it", () => {
    expect(() => assertOrderTransition("fulfilled", "draft")).toThrow(
      IllegalOrderTransitionError,
    );
  });

  test("names both states so the failure is diagnosable", () => {
    try {
      assertOrderTransition("cancelled", "paid");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalOrderTransitionError);
      expect((error as IllegalOrderTransitionError).from).toBe("cancelled");
      expect((error as IllegalOrderTransitionError).to).toBe("paid");
      expect((error as Error).message).toContain("cancelled");
      expect((error as Error).message).toContain("paid");
    }
  });
});

describe("the machine is total", () => {
  test("every status has an entry, so no lookup is undefined", () => {
    for (const status of ALL) {
      expect(Array.isArray(nextOrderStatuses(status))).toBe(true);
    }
  });

  test("every reachable status is one of the declared ones", () => {
    for (const status of ALL) {
      for (const next of nextOrderStatuses(status)) {
        expect(ALL).toContain(next);
      }
    }
  });
});
