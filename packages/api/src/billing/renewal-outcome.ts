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

/**
 * What one attempt did to a renewal.
 *
 * `superseded` is not a failure: it means the row moved on between the charge
 * and this write - a webhook that settled it, another worker that took it -
 * and the answer in hand is stale. Overwriting on the strength of a stale read
 * is how a paid renewal gets marked failed and a customer who has just paid
 * gets a dunning email.
 *
 * Declared in a module of its own, with no imports, purely so that
 * `record-outcome.ts` and the mailer it calls can both name these states
 * without importing each other. `record-outcome.ts` re-exports it, which is
 * where every caller outside this directory still reads it from.
 */
export type RenewalOutcome =
  | "collecting"
  | "awaiting_action"
  | "retry_scheduled"
  | "no_retries"
  | "exhausted"
  | "rescheduled"
  | "superseded";
