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
import { ACCOUNT_INACTIVITY_MONTHS } from "@virtbase/utils";
import type { AccountActivity } from "../eligibility";
import {
  inactiveBefore,
  isEligibleForInactivityDeletion,
} from "../eligibility";

const NOW = new Date("2026-08-26T12:00:00.000Z");

const monthsAgo = (months: number) => {
  const date = new Date(NOW);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
};

/** A genuinely abandoned account: nothing owned, nothing owed, long gone. */
const abandoned = (
  overrides: Partial<AccountActivity> = {},
): AccountActivity => ({
  lastSeenAt: monthsAgo(ACCOUNT_INACTIVITY_MONTHS + 1),
  createdAt: monthsAgo(24),
  servers: 0,
  unpaidInvoices: 0,
  openOrders: 0,
  recentBillingEvents: 0,
  deletionScheduledAt: null,
  offboardingStartedAt: null,
  anonymizedAt: null,
  ...overrides,
});

const verdict = (overrides: Partial<AccountActivity> = {}) =>
  isEligibleForInactivityDeletion(abandoned(overrides), NOW);

describe("isEligibleForInactivityDeletion", () => {
  test("an abandoned account is eligible", () => {
    expect(verdict()).toEqual({ eligible: true });
  });

  test("the annual customer who never signs in is not", () => {
    // The expensive bug this whole function exists to prevent: someone who
    // pays yearly, never opens the dashboard, and has production running.
    expect(verdict({ servers: 1 })).toEqual({
      eligible: false,
      reason: "owns-servers",
    });
  });

  test("a stopped server still counts as owning one", () => {
    // "No running servers" would delete someone who powered their machine off
    // for the winter.
    expect(verdict({ servers: 3 })).toEqual({
      eligible: false,
      reason: "owns-servers",
    });
  });

  test("an unpaid invoice keeps the account", () => {
    expect(verdict({ unpaidInvoices: 1 })).toEqual({
      eligible: false,
      reason: "unpaid-invoice",
    });
  });

  test("an order mid-flight keeps the account", () => {
    expect(verdict({ openOrders: 1 })).toEqual({
      eligible: false,
      reason: "open-order",
    });
  });

  test("recent billing counts as activity even without a sign-in", () => {
    // A renewal charged automatically is the relationship continuing, whether
    // or not anybody logged in to watch it happen.
    expect(verdict({ recentBillingEvents: 1 })).toEqual({
      eligible: false,
      reason: "recent-billing",
    });
  });

  test("someone who signed in last week is not eligible", () => {
    expect(verdict({ lastSeenAt: monthsAgo(0) })).toEqual({
      eligible: false,
      reason: "recently-active",
    });
  });

  test("it holds right up to the edge of the window", () => {
    const justInside = new Date(inactiveBefore(NOW).getTime() + 1000);

    expect(verdict({ lastSeenAt: justInside })).toEqual({
      eligible: false,
      reason: "recently-active",
    });
  });

  test("an account never signed into ages from when it was opened", () => {
    // Otherwise a registration abandoned before the first login never ages.
    expect(verdict({ lastSeenAt: null, createdAt: monthsAgo(12) })).toEqual({
      eligible: true,
    });
  });

  test("a brand new account with no sign-in yet is left alone", () => {
    expect(verdict({ lastSeenAt: null, createdAt: NOW })).toEqual({
      eligible: false,
      reason: "recently-active",
    });
  });

  test("an account already scheduled is not picked up twice", () => {
    expect(verdict({ deletionScheduledAt: NOW })).toEqual({
      eligible: false,
      reason: "already-scheduled",
    });
  });

  test("an account mid-offboarding is left alone", () => {
    expect(verdict({ offboardingStartedAt: NOW })).toEqual({
      eligible: false,
      reason: "offboarding",
    });
  });

  test("an already-erased account is never re-erased", () => {
    expect(verdict({ anonymizedAt: NOW })).toEqual({
      eligible: false,
      reason: "already-anonymised",
    });
  });

  test("ownership is checked before dormancy", () => {
    // The reason matters: the sweep's report is what a human reads before the
    // thing is armed, and "owns-servers" is far more informative than
    // "recently-active" for an account that is both.
    expect(verdict({ servers: 1, lastSeenAt: NOW })).toEqual({
      eligible: false,
      reason: "owns-servers",
    });
  });
});

describe("inactiveBefore", () => {
  test("it is the configured number of months back", () => {
    expect(inactiveBefore(NOW)).toEqual(monthsAgo(ACCOUNT_INACTIVITY_MONTHS));
  });
});
