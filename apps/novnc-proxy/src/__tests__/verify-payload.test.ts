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

import { describe, expect, test } from "bun:test";
import { encryptPayload } from "@virtbase/utils";
import type { WebSocketData } from "@virtbase/validators";
import { InvalidPayloadError, verifyPayload } from "../utils/verify-payload";

const SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_SECRET =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

const NOW = 1_767_225_600_000;

const buildPayload = (
  overrides: Partial<WebSocketData> = {},
): WebSocketData => ({
  vmid: 1000,
  type: "qemu",
  host: "pve01.example.com",
  node: "pve01",
  ticket: "PVEAPIToken=user@pve!console=secret",
  vncticket: "vnc-ticket-123",
  port: 5900,
  serverId: "kvm_alice",
  userId: "usr_alice",
  exp: Math.floor(NOW / 1000) + 300,
  ...overrides,
});

const mint = (overrides: Partial<WebSocketData> = {}, secret = SECRET) =>
  encryptPayload(JSON.stringify(buildPayload(overrides)), secret);

describe("verifyPayload", () => {
  test("accepts a freshly minted payload", async () => {
    const payload = await mint();

    expect(await verifyPayload({ payload, secret: SECRET, now: NOW })).toEqual(
      buildPayload(),
    );
  });

  test("rejects a payload encrypted with a different key", async () => {
    const payload = await mint({}, OTHER_SECRET);

    await expect(
      verifyPayload({ payload, secret: SECRET, now: NOW }),
    ).rejects.toBeInstanceOf(InvalidPayloadError);
  });

  test("rejects a tampered ciphertext", async () => {
    const payload = await mint();
    const [prefix, iv, body] = payload.split(":") as [string, string, string];

    const bytes = Buffer.from(body, "hex");
    // biome-ignore lint/style/noNonNullAssertion: the buffer is non-empty
    bytes[0] = bytes[0]! ^ 0x01;

    await expect(
      verifyPayload({
        payload: `${prefix}:${iv}:${bytes.toString("hex")}`,
        secret: SECRET,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(InvalidPayloadError);
  });

  test("refuses the legacy unauthenticated CBC format outright", async () => {
    // Whatever it decrypts to, an unauthenticated blob handed back by the
    // browser proves nothing, so it never reaches the cipher.
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
      new TextEncoder().encode(JSON.stringify(buildPayload())),
    );
    const legacy = `${Buffer.from(iv).toString("hex")}:${Buffer.from(ciphertext).toString("hex")}`;

    await expect(
      verifyPayload({ payload: legacy, secret: SECRET, now: NOW }),
    ).rejects.toBeInstanceOf(InvalidPayloadError);
  });

  test("rejects an expired payload", async () => {
    const payload = await mint({ exp: Math.floor(NOW / 1000) - 60 });

    await expect(
      verifyPayload({ payload, secret: SECRET, now: NOW }),
    ).rejects.toBeInstanceOf(InvalidPayloadError);
  });

  test("rejects a payload that expired while it sat in a browser tab", async () => {
    const payload = await mint();

    // Same blob, replayed ten minutes later.
    await expect(
      verifyPayload({ payload, secret: SECRET, now: NOW + 10 * 60 * 1000 }),
    ).rejects.toBeInstanceOf(InvalidPayloadError);
  });

  test("tolerates a small amount of clock drift", async () => {
    const payload = await mint({ exp: Math.floor(NOW / 1000) - 5 });

    expect(
      (await verifyPayload({ payload, secret: SECRET, now: NOW })).vmid,
    ).toBe(1000);
  });

  test("rejects an expiry implausibly far in the future", async () => {
    const payload = await mint({ exp: Math.floor(NOW / 1000) + 86_400 });

    await expect(
      verifyPayload({ payload, secret: SECRET, now: NOW }),
    ).rejects.toBeInstanceOf(InvalidPayloadError);
  });

  test("rejects a payload with no session binding", async () => {
    const { serverId, userId, ...unbound } = buildPayload();
    const payload = await encryptPayload(JSON.stringify(unbound), SECRET);

    await expect(
      verifyPayload({ payload, secret: SECRET, now: NOW }),
    ).rejects.toBeInstanceOf(InvalidPayloadError);
  });

  test("rejects a payload with no expiry", async () => {
    const { exp, ...unbounded } = buildPayload();
    const payload = await encryptPayload(JSON.stringify(unbounded), SECRET);

    await expect(
      verifyPayload({ payload, secret: SECRET, now: NOW }),
    ).rejects.toBeInstanceOf(InvalidPayloadError);
  });

  test("carries the session binding through unaltered", async () => {
    const alice = await verifyPayload({
      payload: await mint(),
      secret: SECRET,
      now: NOW,
    });

    expect(alice.serverId).toBe("kvm_alice");
    expect(alice.userId).toBe("usr_alice");
  });

  test("cannot be re-pointed at another customer's server", async () => {
    // Alice holds her own console blob and wants it to name Bob's server. The
    // claims live inside the authenticated ciphertext, so the only edit she can
    // make is one that fails the tag.
    const payload = await mint();
    const target = Buffer.from("kvm_alice");
    const bytes = Buffer.from(payload.split(":")[2] as string, "hex");

    // Splice arbitrary bytes over the region a CBC attacker would have aimed at.
    for (let index = 0; index < bytes.length - target.length; index += 1) {
      const forged = Buffer.from(bytes);
      forged.set(Buffer.from("kvm_bobxx"), index);
      const [prefix, iv] = payload.split(":") as [string, string];

      const result = await verifyPayload({
        payload: `${prefix}:${iv}:${forged.toString("hex")}`,
        secret: SECRET,
        now: NOW,
      }).catch((error: unknown) => error);

      expect(result).toBeInstanceOf(InvalidPayloadError);
    }
  });

  test("rejects a plaintext that is not JSON", async () => {
    const payload = await encryptPayload("not json", SECRET);

    await expect(
      verifyPayload({ payload, secret: SECRET, now: NOW }),
    ).rejects.toBeInstanceOf(InvalidPayloadError);
  });

  test("never leaks the reason through the error message", async () => {
    const expired = await mint({ exp: Math.floor(NOW / 1000) - 600 });
    const garbage = await encryptPayload("not json", SECRET);

    const messages = await Promise.all(
      [expired, garbage].map((payload) =>
        verifyPayload({ payload, secret: SECRET, now: NOW }).then(
          () => "resolved",
          (error: Error) => error.message,
        ),
      ),
    );

    expect(messages).toEqual(["Invalid payload", "Invalid payload"]);
  });
});
