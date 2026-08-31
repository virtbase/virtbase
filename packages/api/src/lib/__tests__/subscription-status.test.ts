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
import type { SubscriptionStatus } from "@virtbase/db/schema";
import {
  assertSubscriptionTransition,
  canTransitionSubscription,
  IllegalSubscriptionTransitionError,
  isRenewableSubscriptionStatus,
  isTerminalSubscriptionStatus,
  nextSubscriptionStatuses,
} from "../subscription-status";

const ALL: SubscriptionStatus[] = [
  "active",
  "past_due",
  "suspended",
  "cancelled",
  "ended",
];

/** Every transition the machine is meant to allow, and nothing else. */
const LEGAL: ReadonlyArray<readonly [SubscriptionStatus, SubscriptionStatus]> =
  [
    ["active", "past_due"],
    ["active", "cancelled"],
    ["active", "suspended"],
    ["active", "ended"],
    ["past_due", "active"],
    ["past_due", "past_due"],
    ["past_due", "suspended"],
    ["past_due", "cancelled"],
    ["past_due", "ended"],
    ["suspended", "active"],
    ["suspended", "ended"],
    ["cancelled", "active"],
    ["cancelled", "ended"],
  ];

const isLegal = (from: SubscriptionStatus, to: SubscriptionStatus) =>
  LEGAL.some(([f, t]) => f === from && t === to);

describe("the declared table", () => {
  test("allows exactly the legal transitions and no others", () => {
    // Exhaustive over all 25 pairs, so adding a status without deciding what
    // it may reach fails here rather than in production.
    for (const from of ALL) {
      for (const to of ALL) {
        expect({
          from,
          to,
          allowed: canTransitionSubscription(from, to),
        }).toEqual({ from, to, allowed: isLegal(from, to) });
      }
    }
  });

  test("every status has an entry, so no lookup is undefined", () => {
    for (const status of ALL) {
      expect(Array.isArray(nextSubscriptionStatuses(status))).toBe(true);
    }
  });
});

describe("the happy path", () => {
  test("walks active through dunning and back", () => {
    expect(canTransitionSubscription("active", "past_due")).toBe(true);
    expect(canTransitionSubscription("past_due", "active")).toBe(true);
  });

  test("a second decline is not a state change but must not throw", () => {
    // The dunning ladder steps through the renewal's attempt count, not
    // through the subscription's status. Throwing here would turn an ordinary
    // decline into a page.
    expect(canTransitionSubscription("past_due", "past_due")).toBe(true);
    expect(() =>
      assertSubscriptionTransition("past_due", "past_due"),
    ).not.toThrow();
  });

  test("dunning exhausted suspends", () => {
    expect(canTransitionSubscription("past_due", "suspended")).toBe(true);
  });

  test("a customer who pays gets their server back", () => {
    expect(canTransitionSubscription("suspended", "active")).toBe(true);
  });

  test("cancelling can be undone before the period runs out", () => {
    expect(canTransitionSubscription("cancelled", "active")).toBe(true);
  });
});

describe("subscriptions cannot move backwards", () => {
  test("nothing leaves ended", () => {
    for (const status of ALL) {
      expect(canTransitionSubscription("ended", status)).toBe(false);
    }
    expect(nextSubscriptionStatuses("ended")).toHaveLength(0);
  });

  test("a suspended subscription is not put back into dunning", () => {
    // The ladder is already exhausted; re-entering it would suspend the
    // customer a second time for the same failure.
    expect(canTransitionSubscription("suspended", "past_due")).toBe(false);
    expect(canTransitionSubscription("suspended", "cancelled")).toBe(false);
  });

  test("a cancelled subscription is never billed again", () => {
    expect(canTransitionSubscription("cancelled", "past_due")).toBe(false);
    expect(canTransitionSubscription("cancelled", "suspended")).toBe(false);
  });

  test("an active subscription cannot skip straight to itself", () => {
    expect(canTransitionSubscription("active", "active")).toBe(false);
  });
});

describe("terminal and renewable states", () => {
  test("only ended is terminal", () => {
    expect(isTerminalSubscriptionStatus("ended")).toBe(true);
    for (const status of ALL.filter((s) => s !== "ended")) {
      expect(isTerminalSubscriptionStatus(status)).toBe(false);
    }
  });

  test("only active and past_due may be charged", () => {
    expect(isRenewableSubscriptionStatus("active")).toBe(true);
    expect(isRenewableSubscriptionStatus("past_due")).toBe(true);
    expect(isRenewableSubscriptionStatus("suspended")).toBe(false);
    expect(isRenewableSubscriptionStatus("cancelled")).toBe(false);
    expect(isRenewableSubscriptionStatus("ended")).toBe(false);
  });

  test("every non-terminal state can be ended", () => {
    // A subject can always go away - a server deleted, a customer offboarded -
    // and a subscription for something that no longer exists has to be
    // closeable from wherever it stood.
    for (const status of ALL.filter((s) => s !== "ended")) {
      expect(canTransitionSubscription(status, "ended")).toBe(true);
    }
  });
});

describe("assertSubscriptionTransition", () => {
  test("passes a legal transition", () => {
    expect(() =>
      assertSubscriptionTransition("active", "past_due"),
    ).not.toThrow();
  });

  test("throws on an illegal one rather than ignoring it", () => {
    expect(() => assertSubscriptionTransition("ended", "active")).toThrow(
      IllegalSubscriptionTransitionError,
    );
  });

  test("names both states so the failure is diagnosable", () => {
    try {
      assertSubscriptionTransition("ended", "active");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalSubscriptionTransitionError);
      expect((error as IllegalSubscriptionTransitionError).from).toBe("ended");
      expect((error as IllegalSubscriptionTransitionError).to).toBe("active");
      expect((error as Error).message).toContain("ended");
      expect((error as Error).message).toContain("active");
    }
  });
});
