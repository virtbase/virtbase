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

export interface IpReputation {
  ip: string;
  /** 0-100, normalised by the adapter. Higher is worse. */
  score: number;
  /** Provider category names, already mapped to our own vocabulary. */
  categories: string[];
  totalReports: number;
  lastReportedAt: Date | null;
  countryCode?: string;
  /**
   * `Data Center/Web Hosting/Transit`, `Fixed Line ISP`, `University`.
   *
   * Changes how a score should be read: a hosting range scores badly for
   * structural reasons, and treating that as evidence about one customer is
   * how an abuse desk starts rejecting legitimate signups.
   */
  usageType?: string;
}

/**
 * A reputation database, asked about one address at a time.
 *
 * Separate from {@link AbuseSource} because it is synchronous and
 * bidirectional: triage asks about a reported address, checkout may ask about
 * a signup address, and a resolved case may submit a report back.
 */
export interface IpReputationProvider {
  readonly id: string;
  check(ip: string, options?: { maxAgeDays?: number }): Promise<IpReputation>;
  /**
   * Publishes a report. Optional, because not every provider accepts them.
   *
   * Never called automatically. Reporting an address is a commercial act with
   * consequences for the whole range's reputation, so it stays behind an
   * operator's explicit confirmation on a resolved case.
   */
  report?(input: {
    ip: string;
    categories: string[];
    comment: string;
  }): Promise<{ externalId?: string }>;
}
