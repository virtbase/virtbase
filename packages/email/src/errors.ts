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
 * A message that did not go out.
 *
 * Every send path in this package raises one rather than logging and
 * returning, because the Resend SDK never throws: its transport turns a
 * revoked API key, an unverified sending domain and a dropped connection
 * alike into `{ data: null, error }`, which a caller that ignores the return
 * value cannot tell from a success. Swallowing that made the platform record
 * notices as delivered that were never sent - and the abuse desk starts a
 * customer's response clock, and escalates enforcement on their silence,
 * from exactly that record.
 *
 * `cause` carries the provider's own error object where there is one, so the
 * message stored on a failed delivery row names the real reason.
 */
export class EmailDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmailDeliveryError";
  }
}
