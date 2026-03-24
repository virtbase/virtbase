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
 * Derives a 32-byte AES-256 key from any arbitrary string secret by hashing it
 * with SHA-256, returning the result as a 64-character hex string suitable for
 * use with encryptPayload / decryptPayload.
 */
export const deriveKeyHex = async (secret: string): Promise<string> => {
  const encoded = new TextEncoder().encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Buffer.from(hashBuffer).toString("hex");
};

/**
 * Encrypts a string payload using AES-256-CBC encryption.
 *
 * The output will be in the format:
 * <iv>:<encrypted>
 *
 * The iv is a 16 byte hex string.
 * The encrypted is a hex string.
 *
 * The secret must be a hex encoded string.
 *
 */
export const encryptPayload = async (
  payload: string,
  secret: string,
): Promise<string> => {
  // Generate a random 16-byte IV
  const iv = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(secret, "hex"),
    {
      name: "AES-CBC",
      length: 256,
    },
    true,
    ["encrypt"],
  );

  const encodedPayload = new TextEncoder().encode(payload);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-CBC",
      iv,
    },
    key,
    encodedPayload,
  );

  // Convert iv and encrypted buffer to hex
  const ivHex = Buffer.from(iv).toString("hex");
  const encryptedHex = Buffer.from(encryptedBuffer).toString("hex");

  return `${ivHex}:${encryptedHex}`;
};

/**
 * Decrypts a string payload using AES-256-CBC encryption.
 *
 * The payload is expected to be in the format:
 * <iv>:<encrypted>
 *
 * The iv is a 16 byte hex string.
 * The encrypted is a hex string.
 *
 * The secret must be a hex encoded string.
 *
 */
export const decryptPayload = async (
  payload: string,
  secret: string,
): Promise<string> => {
  const [ivHex, encryptedHex] = payload.split(":");

  if (!ivHex || !encryptedHex) {
    throw new Error(
      "AES decryption: Payload is malformed. Expected format: <iv>:<encrypted>",
    );
  }

  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(secret, "hex"),
    {
      name: "AES-CBC",
      length: 256,
    },
    true,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-CBC",
      iv,
    },
    key,
    encrypted,
  );

  return new TextDecoder().decode(decrypted);
};
