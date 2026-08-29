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

/** The model used for report triage, as the Vercel AI Gateway names it. */
export const ABUSE_TRIAGE_MODEL = "anthropic/claude-haiku-4.5";

/** Budget for one classification, retries included. */
export const TRIAGE_TIMEOUT_MS = 20_000;

/**
 * How much of a report the model is shown.
 *
 * Abuse reports arrive with a hundred kilobytes of log lines attached. The
 * first part carries the accusation and the addresses; the rest is evidence
 * for a human, and paying to tokenise it buys nothing.
 */
export const MAX_TRIAGE_BODY_CHARS = 8_000;

/** How many cases one sweep classifies, so the spend per run is bounded. */
export const TRIAGE_BATCH_SIZE = 10;
