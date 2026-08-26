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

import { ACCOUNT_INACTIVITY_MONTHS } from "@virtbase/utils";

/**
 * Everything the decision rests on, read from the database by the sweep.
 *
 * A plain record rather than a query result so the rule can be tested against
 * fabricated accounts - which is the only practical way to cover "annual
 * customer who never signs in" without waiting a year.
 */
export interface AccountActivity {
  lastSeenAt: Date | null;
  createdAt: Date;
  /** Any server at all, running or not. */
  servers: number;
  unpaidInvoices: number;
  openOrders: number;
  /** Orders or payments inside the inactivity window. */
  recentBillingEvents: number;
  deletionScheduledAt: Date | null;
  offboardingStartedAt: Date | null;
  anonymizedAt: Date | null;
}

/** Why an account was passed over, for the sweep's report. */
export type IneligibleReason =
  | "already-anonymised"
  | "already-scheduled"
  | "offboarding"
  | "owns-servers"
  | "unpaid-invoice"
  | "open-order"
  | "recent-billing"
  | "recently-active";

export type Eligibility =
  | { eligible: true }
  | { eligible: false; reason: IneligibleReason };

/**
 * Whether an account has genuinely been abandoned.
 *
 * The risk this function exists to manage is not failing to delete. It is
 * deleting a customer who is perfectly happy - the one who pays annually,
 * never opens the dashboard, and has a production server running. Every clause
 * below is a way that customer gets missed by "last login was ages ago".
 *
 * Owning a server is doing most of the work: the service relationship has not
 * ended, so the clock has not started.
 */
export function isEligibleForInactivityDeletion(
  account: AccountActivity,
  now: Date = new Date(),
): Eligibility {
  const no = (reason: IneligibleReason): Eligibility => ({
    eligible: false,
    reason,
  });

  if (account.anonymizedAt) return no("already-anonymised");
  if (account.offboardingStartedAt) return no("offboarding");
  if (account.deletionScheduledAt) return no("already-scheduled");

  if (account.servers > 0) return no("owns-servers");
  if (account.unpaidInvoices > 0) return no("unpaid-invoice");
  if (account.openOrders > 0) return no("open-order");
  if (account.recentBillingEvents > 0) return no("recent-billing");

  // An account that has never been signed into is judged from when it was
  // opened. Otherwise a registration abandoned before the first login would
  // never age at all.
  const lastActivity = account.lastSeenAt ?? account.createdAt;

  if (lastActivity > inactiveBefore(now)) return no("recently-active");

  return { eligible: true };
}

/** The instant an account must not have been touched since. */
export function inactiveBefore(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - ACCOUNT_INACTIVITY_MONTHS);

  return cutoff;
}
