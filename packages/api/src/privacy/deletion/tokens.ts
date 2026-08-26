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

export const hashDeletionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
