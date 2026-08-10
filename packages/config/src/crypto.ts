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
 * Envelope encryption for configuration secrets.
 *
 * AES-256-GCM rather than the CBC helper in `@virtbase/utils`: GCM is
 * authenticated, so a tampered or truncated ciphertext fails loudly instead of
 * decrypting to garbage. That matters here because the plaintext is a
 * credential that gets handed straight to a third-party API.
 *
 * Two levels:
 *   - a bootstrap key, from `CONFIG_ENCRYPTION_KEY`, which only ever wraps
 *   - a per-installation data key, which encrypts the actual secret values
 *
 * Rotating the bootstrap key therefore rewraps one short string per
 * installation and leaves every stored ciphertext untouched.
 */

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/** `<iv>:<ciphertext+tag>`, both base64. */
type Envelope = string;

const toBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64");

const fromBase64 = (value: string): Uint8Array =>
  new Uint8Array(Buffer.from(value, "base64"));

/**
 * Parses the bootstrap key. Accepts base64 or hex so operators are not forced
 * into one encoding, but insists on exactly 32 bytes — a short key here would
 * silently weaken every secret in the system.
 */
export const parseMasterKey = (value: string): Uint8Array => {
  const trimmed = value.trim();

  const candidates: Uint8Array[] = [];
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    candidates.push(new Uint8Array(Buffer.from(trimmed, "hex")));
  }
  try {
    candidates.push(fromBase64(trimmed));
  } catch {
    // Not base64; the hex branch above may still have produced a candidate.
  }

  const key = candidates.find((candidate) => candidate.length === KEY_LENGTH);
  if (!key) {
    throw new Error(
      "CONFIG_ENCRYPTION_KEY must be 32 bytes, encoded as 64 hex characters or base64. " +
        "Generate one with: openssl rand -base64 32",
    );
  }

  return key;
};

/** Generates a fresh key, for the bootstrap variable or for a data key. */
export const generateKey = (): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(KEY_LENGTH));

const importKey = (raw: Uint8Array, usage: "encrypt" | "decrypt") =>
  crypto.subtle.importKey(
    "raw",
    raw as unknown as ArrayBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );

export const encrypt = async (
  plaintext: string,
  key: Uint8Array,
): Promise<Envelope> => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importKey(key, "encrypt"),
    new TextEncoder().encode(plaintext),
  );

  return `${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
};

export const decrypt = async (
  envelope: Envelope,
  key: Uint8Array,
): Promise<string> => {
  const [ivPart, ciphertextPart] = envelope.split(":");
  if (!ivPart || !ciphertextPart) {
    throw new Error("Malformed ciphertext. Expected '<iv>:<ciphertext>'.");
  }

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) as unknown as ArrayBuffer },
    await importKey(key, "decrypt"),
    fromBase64(ciphertextPart) as unknown as ArrayBuffer,
  );

  return new TextDecoder().decode(plaintext);
};

/** Encrypts a data key with the bootstrap key, for storage on the installation. */
export const wrapDataKey = async (
  dataKey: Uint8Array,
  masterKey: Uint8Array,
): Promise<string> => encrypt(toBase64(dataKey), masterKey);

export const unwrapDataKey = async (
  wrapped: string,
  masterKey: Uint8Array,
): Promise<Uint8Array> => fromBase64(await decrypt(wrapped, masterKey));
