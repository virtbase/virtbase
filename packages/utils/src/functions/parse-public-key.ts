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

export type ParsedPublicKey = {
  sanitzedKey: string;
  fingerprint: string;
};

/**
 * Parse a public key and return the base64 key,
 * the sanitized key, and the MD5 fingerprint.
 *
 * @param publicKey The public key to parse.
 * @returns The base64 key, the sanitized key, and the MD5 fingerprint.
 */
export async function parsePublicKey(
  publicKey: string,
): Promise<ParsedPublicKey> {
  const crypto = await import("node:crypto");

  if (!publicKey) {
    throw new Error("Public key is required");
  }

  const parts = publicKey.trim().split(/\s+/);
  if (parts.length < 2) {
    throw new Error("Invalid public key format");
  }

  const base64Key = parts[1] as string;
  const keyBuffer = Buffer.from(base64Key, "base64");

  const hash = crypto.createHash("md5").update(keyBuffer).digest("hex");
  const groups = hash.match(/.{2}/g);
  if (!groups) {
    throw new Error("Invalid fingerprint");
  }

  return {
    sanitzedKey: parts.slice(0, 2).join(" "),
    fingerprint: groups.join(":"),
  };
}
