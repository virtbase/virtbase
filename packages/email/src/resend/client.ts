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

import { Resend } from "resend";

let cached: { apiKey: string; client: Resend } | null = null;

/**
 * The Resend client, or null when no API key is configured.
 *
 * Read at call time rather than captured at module load, so that "is there a
 * provider at all?" is answered by the environment the send actually runs in.
 * The instance is memoised on the key, so this stays one construction per
 * process in the normal case.
 */
export const getResendClient = (): Resend | null => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  if (cached?.apiKey !== apiKey) {
    cached = { apiKey, client: new Resend(apiKey) };
  }

  return cached.client;
};

/**
 * The same client, bound once at module load.
 *
 * Kept for consumers that hold the instance directly - the Resend webhook
 * route reads inbound mail through it. Sending goes through
 * {@link getResendClient}.
 */
export const resend = getResendClient();
