/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, test } from "bun:test";
import { encryptPayload } from "@virtbase/utils";
import type { WebSocketData } from "@virtbase/validators";
import { verifyPayload } from "../payload";

const SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_SECRET =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

const NOW = 1_767_225_600;

const consoleData = (
  overrides: Partial<WebSocketData> = {},
): WebSocketData => ({
  vmid: 1000,
  type: "qemu",
  host: "pve01.example.com",
  node: "pve01",
  ticket: "PVEAPIToken=root@pam!console=secret",
  vncticket: "PVEVNC:6720F1A2::vnc-signature",
  port: 5900,
  serverId: "kvm_alice",
  userId: "usr_alice",
  exp: NOW + 300,
  ...overrides,
});

const mint = (overrides: Partial<WebSocketData> = {}): Promise<string> =>
  encryptPayload(JSON.stringify(consoleData(overrides)), SECRET);

/** The old unauthenticated format: `<iv>:<ciphertext>`, AES-256-CBC. */
const mintLegacyCbc = async (plaintext: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(Buffer.from(SECRET, "hex")),
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${Buffer.from(iv).toString("hex")}:${Buffer.from(ciphertext).toString("hex")}`;
};

const flipFirstCiphertextBit = (payload: string): string => {
  const [prefix, iv, body = ""] = payload.split(":");
  const bytes = Buffer.from(body, "hex");
  bytes.writeUInt8(bytes.readUInt8(0) ^ 1, 0);
  return `${prefix}:${iv}:${bytes.toString("hex")}`;
};

describe("verifyPayload", () => {
  test("returns the console a freshly minted payload names", async () => {
    expect(await verifyPayload(await mint(), SECRET, NOW)).toEqual({
      ok: true,
      data: consoleData(),
    });
  });

  test("refuses the legacy CBC format without decrypting it", async () => {
    // It would decrypt under the right key, which is exactly why that proves
    // nothing: CBC lets whoever holds a ciphertext edit the plaintext.
    const legacy = await mintLegacyCbc(JSON.stringify(consoleData()));

    expect(await verifyPayload(legacy, SECRET, NOW)).toEqual({
      ok: false,
      reason: "not in the authenticated format",
    });
  });

  test("refuses a payload encrypted under another key", async () => {
    const payload = await encryptPayload(
      JSON.stringify(consoleData()),
      OTHER_SECRET,
    );

    expect(await verifyPayload(payload, SECRET, NOW)).toEqual({
      ok: false,
      reason: "decryption or authentication failed",
    });
  });

  test("refuses a payload with a single bit flipped", async () => {
    const tampered = flipFirstCiphertextBit(await mint());

    expect(await verifyPayload(tampered, SECRET, NOW)).toEqual({
      ok: false,
      reason: "decryption or authentication failed",
    });
  });

  test.each([
    ["not JSON", "RFB 003.008"],
    ["missing the session binding", { ...consoleData(), serverId: undefined }],
    ["missing the expiry", { ...consoleData(), exp: undefined }],
    ["naming an unknown guest type", { ...consoleData(), type: "docker" }],
  ])("refuses an authentic plaintext %s", async (_, plaintext) => {
    const payload = await encryptPayload(
      typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext),
      SECRET,
    );

    expect(await verifyPayload(payload, SECRET, NOW)).toEqual({
      ok: false,
      reason: "plaintext is not a console payload",
    });
  });

  test.each([
    ["29 seconds ago, within the allowed clock skew", NOW - 29],
    ["exactly an hour away", NOW + 3600],
  ])("accepts an expiry %s", async (_, exp) => {
    const result = await verifyPayload(await mint({ exp }), SECRET, NOW);

    expect(result.ok).toBe(true);
  });

  test.each([
    ["30 seconds ago", NOW - 30, "expired"],
    [
      "an hour and a second away",
      NOW + 3601,
      "expires implausibly far in the future",
    ],
  ])("refuses an expiry %s", async (_, exp, reason) => {
    expect(await verifyPayload(await mint({ exp }), SECRET, NOW)).toEqual({
      ok: false,
      reason,
    });
  });
});
