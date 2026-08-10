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
  decrypt,
  encrypt,
  generateKey,
  parseMasterKey,
  unwrapDataKey,
  wrapDataKey,
} from "../crypto";

describe("parseMasterKey", () => {
  test("accepts 32 bytes as hex or base64", () => {
    const key = generateKey();
    const hex = Buffer.from(key).toString("hex");
    const base64 = Buffer.from(key).toString("base64");

    expect([...parseMasterKey(hex)]).toEqual([...key]);
    expect([...parseMasterKey(base64)]).toEqual([...key]);
    expect([...parseMasterKey(` ${base64} `)]).toEqual([...key]);
  });

  test("rejects a key that is not 32 bytes", () => {
    // A short key would silently weaken every secret in the system.
    expect(() => parseMasterKey("too-short")).toThrow(/32 bytes/);
    expect(() =>
      parseMasterKey(Buffer.from(new Uint8Array(16)).toString("base64")),
    ).toThrow(/32 bytes/);
  });
});

describe("encrypt / decrypt", () => {
  test("round-trips a value", async () => {
    const key = generateKey();
    const secret = "sk_live_not_a_real_credential";

    expect(await decrypt(await encrypt(secret, key), key)).toBe(secret);
  });

  test("produces a different ciphertext each time", async () => {
    const key = generateKey();

    // A fresh IV per encryption; identical secrets must not look identical
    // to anyone reading the table.
    expect(await encrypt("same", key)).not.toBe(await encrypt("same", key));
  });

  test("fails on the wrong key", async () => {
    const envelope = await encrypt("secret", generateKey());

    await expect(decrypt(envelope, generateKey())).rejects.toThrow();
  });

  test("fails on a tampered ciphertext rather than returning garbage", async () => {
    const key = generateKey();
    const envelope = await encrypt("secret", key);
    const [iv, body] = envelope.split(":");

    const flipped = Buffer.from(body as string, "base64");
    flipped[0] = (flipped[0] as number) ^ 0xff;

    await expect(
      decrypt(`${iv}:${flipped.toString("base64")}`, key),
    ).rejects.toThrow();
  });

  test("rejects a malformed envelope", async () => {
    await expect(decrypt("no-separator", generateKey())).rejects.toThrow(
      /Malformed/,
    );
  });
});

describe("data key wrapping", () => {
  test("round-trips a data key through the master key", async () => {
    const masterKey = generateKey();
    const dataKey = generateKey();

    const wrapped = await wrapDataKey(dataKey, masterKey);
    expect([...(await unwrapDataKey(wrapped, masterKey))]).toEqual([
      ...dataKey,
    ]);
  });

  test("rotating the master key leaves secrets readable", async () => {
    const oldMaster = generateKey();
    const newMaster = generateKey();
    const dataKey = generateKey();

    const ciphertext = await encrypt("credential", dataKey);
    const wrapped = await wrapDataKey(dataKey, oldMaster);

    // Rotation rewraps the short data key; the secret itself is never touched.
    const rewrapped = await wrapDataKey(
      await unwrapDataKey(wrapped, oldMaster),
      newMaster,
    );

    expect(
      await decrypt(ciphertext, await unwrapDataKey(rewrapped, newMaster)),
    ).toBe("credential");
  });
});
