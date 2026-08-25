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

/** Discord's epoch: 2015-01-01T00:00:00Z, in milliseconds. */
const DISCORD_EPOCH = 1_420_070_400_000n;

/**
 * When Discord created the object this id belongs to.
 *
 * The top 42 bits of a snowflake are a millisecond timestamp, which makes an
 * interaction id a clock reading from Discord's side of the connection.
 *
 * That is the only way to tell the two halves of "did not respond in time"
 * apart: elapsed measured locally says how long the handler took, while elapsed
 * measured from here includes everything before the request arrived — a tunnel,
 * a cold serverless start, a slow link. A handler that answers in 300ms local
 * but 4s by this clock is not a slow handler.
 */
export const snowflakeCreatedAt = (id: string): Date | null => {
  if (!/^\d{1,20}$/.test(id)) return null;

  try {
    return new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));
  } catch {
    return null;
  }
};

/** Milliseconds since Discord created the object, or `null` for a bad id. */
export const millisecondsSince = (id: string): number | null => {
  const createdAt = snowflakeCreatedAt(id);
  return createdAt ? Date.now() - createdAt.getTime() : null;
};
