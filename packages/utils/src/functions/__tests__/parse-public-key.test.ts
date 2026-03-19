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

import { describe, expect, mock, test } from "bun:test";
import { parsePublicKey } from "../parse-public-key";

// Generic public key with comment (needs to be sanitzed by the API)
const mockPublicKey =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOwfgos15R2Hml0DLTiYY5oTO2P6mCe6OrfICvE0Kjxz Testing Key";

// Sanitzed public key (without comment)
const sanitizedMockPublicKey =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOwfgos15R2Hml0DLTiYY5oTO2P6mCe6OrfICvE0Kjxz";

// Fingerprint of the mocked public key (matches the sanitized key)
const mockFingerprint = "9b:a0:ba:37:33:01:cf:88:d9:2d:57:db:0d:3a:60:ab";

describe("parsePublicKey", () => {
  test("it returns the correct fingerprint and sanitized key for a given public key", async () => {
    const parsed = await parsePublicKey(mockPublicKey);

    expect(parsed).toEqual({
      sanitzedKey: sanitizedMockPublicKey,
      fingerprint: mockFingerprint,
    });
  });

  test("it throws an error if the format is invalid", () => {
    expect(parsePublicKey(undefined as never)).rejects.toThrow(Error);
    expect(parsePublicKey("")).rejects.toThrow(Error);
    expect(parsePublicKey("invalid")).rejects.toThrow(Error);
  });

  test("it throws an error if the fingerprint is invalid", async () => {
    mock.module("node:crypto", () => ({
      createHash: () => ({
        update: () => ({
          digest: () => "", // empty string -> match(/.{2}/g) returns null
        }),
      }),
    }));

    expect(parsePublicKey("ssh-ed25519 AAAA")).rejects.toThrow(Error);
  });
});
