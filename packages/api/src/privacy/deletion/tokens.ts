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

import { createHash, randomBytes } from "node:crypto";

/**
 * A confirmation token and the hash we store for it.
 *
 * [!] Only the hash is ever written down. Anyone able to read
 * `account_deletion_tokens` would otherwise be able to confirm a deletion on
 * someone else's behalf - which is precisely the capability the token exists
 * to gate.
 */
export const createDeletionToken = () => {
  const token = randomBytes(32).toString("base64url");

  return { token, tokenHash: hashDeletionToken(token) };
};

/** A SHA-256 digest, rendered as hex: exactly 64 characters, nothing else. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

export const hashDeletionToken = (token: string) => {
  const digest = createHash("sha256").update(token).digest("hex");

  // [!] Fails **closed**. The hash is not a convenience here, it is the whole
  // comparison: `confirmAccountDeletion` matches a supplied token against the
  // stored digest with a plain equality test. A hashing function that ever
  // degenerated - to an empty string, to a constant, to anything not injective
  // - would therefore make every token match every pending deletion, turning
  // the one control that stops a borrowed session from erasing an account into
  // a formality. That failure is silent by nature, so it is asserted rather
  // than trusted.
  if (!SHA256_HEX.test(digest)) {
    throw new Error(
      "Deletion token hashing is broken: SHA-256 did not return a hex digest.",
    );
  }

  return digest;
};
