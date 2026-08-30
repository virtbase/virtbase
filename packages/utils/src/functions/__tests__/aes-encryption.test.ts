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
import {
  decryptPayload,
  deriveKeyHex,
  encryptPayload,
  isAuthenticatedPayload,
} from "../aes-encryption";

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_KEY =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

/** Reproduces the pre-GCM wire format, which only `decryptPayload` still reads. */
const encryptLegacyCbc = async (plaintext: string, secret: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(Buffer.from(secret, "hex")),
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

describe("encryptPayload / decryptPayload", () => {
  test("round-trips a payload", async () => {
    const plaintext = JSON.stringify({ vmid: 1000, hello: "wörld" });
    const ciphertext = await encryptPayload(plaintext, KEY);

    expect(await decryptPayload(ciphertext, KEY)).toBe(plaintext);
  });

  test("emits the authenticated wire format", async () => {
    const ciphertext = await encryptPayload("hello", KEY);

    expect(isAuthenticatedPayload(ciphertext)).toBe(true);
    const parts = ciphertext.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("gcm");
    // 12 byte nonce, hex encoded
    expect(parts[1]).toHaveLength(24);
  });

  test("uses a fresh nonce for every call", async () => {
    const a = await encryptPayload("hello", KEY);
    const b = await encryptPayload("hello", KEY);

    expect(a).not.toBe(b);
  });

  test("rejects a tampered ciphertext instead of decrypting it to garbage", async () => {
    const ciphertext = await encryptPayload("hello world", KEY);
    const [prefix, iv, body] = ciphertext.split(":") as [
      string,
      string,
      string,
    ];

    // Flip the low bit of the first ciphertext byte. Under AES-CBC this would
    // have flipped bits in the plaintext without the key; under GCM the tag
    // stops it.
    const bytes = Buffer.from(body, "hex");
    // biome-ignore lint/style/noNonNullAssertion: the buffer is non-empty
    bytes[0] = bytes[0]! ^ 0x01;
    const tampered = `${prefix}:${iv}:${bytes.toString("hex")}`;

    expect(tampered).not.toBe(ciphertext);
    await expect(decryptPayload(tampered, KEY)).rejects.toThrow();
  });

  test("rejects a tampered nonce", async () => {
    const ciphertext = await encryptPayload("hello world", KEY);
    const [prefix, iv, body] = ciphertext.split(":") as [
      string,
      string,
      string,
    ];

    const bytes = Buffer.from(iv, "hex");
    // biome-ignore lint/style/noNonNullAssertion: the buffer is non-empty
    bytes[0] = bytes[0]! ^ 0x01;

    await expect(
      decryptPayload(`${prefix}:${bytes.toString("hex")}:${body}`, KEY),
    ).rejects.toThrow();
  });

  test("rejects a truncated ciphertext", async () => {
    const ciphertext = await encryptPayload("hello world", KEY);
    const [prefix, iv, body] = ciphertext.split(":") as [
      string,
      string,
      string,
    ];

    await expect(
      decryptPayload(`${prefix}:${iv}:${body.slice(0, -4)}`, KEY),
    ).rejects.toThrow();
  });

  test("rejects the wrong key", async () => {
    const ciphertext = await encryptPayload("hello world", KEY);

    await expect(decryptPayload(ciphertext, OTHER_KEY)).rejects.toThrow();
  });

  test("rejects a malformed payload", async () => {
    await expect(decryptPayload("", KEY)).rejects.toThrow();
    await expect(decryptPayload("gcm:", KEY)).rejects.toThrow();
    await expect(decryptPayload("gcm:a:b:c", KEY)).rejects.toThrow();
    await expect(decryptPayload("not-a-payload", KEY)).rejects.toThrow();
  });

  test("rejects an authenticated payload whose nonce is the wrong length", async () => {
    await expect(decryptPayload("gcm:00:0011", KEY)).rejects.toThrow();
  });
});

describe("isAuthenticatedPayload", () => {
  test("is false for the legacy unauthenticated format", async () => {
    const legacy = await encryptLegacyCbc("hello", KEY);

    expect(isAuthenticatedPayload(legacy)).toBe(false);
  });

  test("is true for what encryptPayload produces", async () => {
    expect(isAuthenticatedPayload(await encryptPayload("hello", KEY))).toBe(
      true,
    );
  });
});

describe("legacy AES-256-CBC compatibility", () => {
  // `packages/api/src/orders/legacy-snapshot.ts` reads ciphertext that was
  // persisted into Stripe metadata before the switch to GCM. It has to keep
  // decrypting, or an in-flight pre-cutover payment can never be fulfilled.
  test("still decrypts persisted CBC ciphertext", async () => {
    const plaintext = JSON.stringify({ configuration: "snapshot" });
    const legacy = await encryptLegacyCbc(plaintext, KEY);

    expect(await decryptPayload(legacy, KEY)).toBe(plaintext);
  });
});

describe("deriveKeyHex", () => {
  test("produces a 32 byte key as 64 hex characters", async () => {
    const key = await deriveKeyHex("sk_test_something");

    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic", async () => {
    expect(await deriveKeyHex("secret")).toBe(await deriveKeyHex("secret"));
    expect(await deriveKeyHex("secret")).not.toBe(
      await deriveKeyHex("secret2"),
    );
  });

  test("round-trips through encryptPayload", async () => {
    const key = await deriveKeyHex("sk_test_something");

    expect(await decryptPayload(await encryptPayload("hi", key), key)).toBe(
      "hi",
    );
  });
});
