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

import type { InboundSignal } from "./signal";

export type AbuseCategory =
  | "spam"
  | "phishing"
  | "malware"
  | "port_scan"
  | "ddos"
  | "copyright"
  | "compromised"
  | "other";

export interface AbusePollRequest {
  /** The source's watermark. Records older than this are already known. */
  since: Date;
  /**
   * The ranges to look at, chosen by the poller from our own subnets.
   *
   * Handed in rather than discovered, because an integration must not read
   * the database - and because a source that picked its own targets could be
   * pointed at somebody else's address space.
   */
  targets: { cidr: string }[];
  /**
   * Hard cap on provider calls for this run, derived from what is left of the
   * daily quota. A source that would exceed it stops and reports what it
   * covered instead.
   */
  budget: number;
}

export interface AbusePollResult {
  signals: InboundSignal[];
  /**
   * The targets actually covered, as CIDR strings.
   *
   * Only these advance their watermark. A run cut short by the budget has not
   * seen the rest of the ranges, and pretending otherwise would silently skip
   * a window that is never looked at again.
   */
  covered: string[];
  /** Provider-reported quota left, so the next run can size its own budget. */
  quotaRemaining?: number;
}

/**
 * Somewhere abuse reports have to be fetched from.
 *
 * Only for sources with no push side - AbuseIPDB is the reason this exists.
 * Anything that can call us implements an integration webhook instead and
 * submits through the `signals` port, which is cheaper for everyone.
 */
export interface AbuseSource {
  readonly id: string;
  poll?(request: AbusePollRequest): Promise<AbusePollResult>;
}
