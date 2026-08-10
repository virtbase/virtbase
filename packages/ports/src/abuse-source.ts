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

export type AbuseCategory =
  | "spam"
  | "phishing"
  | "malware"
  | "port-scan"
  | "ddos"
  | "copyright"
  | "other";

export interface AbuseReport {
  /**
   * Source-scoped id used for deduplication — a mailbox message id, an
   * AbuseIPDB report id. The abuse pipeline keys cases on `(sourceId, id)`.
   */
  id: string;
  /** The reported address; resolved to a server through subnet allocations. */
  ip: string;
  category: AbuseCategory;
  reportedAt: Date;
  /** Free-text body as received, retained verbatim for the case record. */
  body: string;
  reporter?: { name?: string; email?: string };
}

/**
 * Somewhere abuse reports come from: a polled mailbox, the AbuseIPDB API, or
 * the public report form.
 *
 * Pull-based sources implement `poll` and are driven by the worker; push-based
 * sources hand reports to the pipeline through their own webhook and implement
 * only `id`.
 */
export interface AbuseSource {
  readonly id: string;
  /** Fetch reports newer than the last processed watermark. */
  poll?(since: Date): Promise<AbuseReport[]>;
}
