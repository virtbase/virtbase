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
 * Symmetric encryption for payloads that round-trip through an untrusted
 * client — today, the noVNC console blob that the browser hands back to
 * `@virtbase/novnc-proxy`.
 *
 * New ciphertext is AES-256-GCM, following the same reasoning as
 * `@virtbase/config`'s envelope crypto: the receiver's entire trust model is
 * "it decrypted, therefore it came from us", and unauthenticated CBC does not
 * support that claim. CBC is malleable, so an attacker holding a ciphertext can
 * flip bits in the plaintext without the key; GCM's tag makes any such edit a
 * decryption failure.
 *
 * Hex rather than base64 (which is what `@virtbase/config` uses) because this
 * ciphertext travels in a URL query string and hex needs no percent-encoding.
 *
 * Two wire formats exist:
 *
 *   - `gcm:<iv>:<ciphertext+tag>` — authenticated, what `encryptPayload` emits.
 *   - `<iv>:<ciphertext>`         — legacy AES-256-CBC, decrypt-only.
 *
 * The legacy branch survives for exactly one caller,
 * `packages/api/src/orders/legacy-snapshot.ts`, which reads CBC ciphertext that
 * was persisted into Stripe metadata before the order table existed. It goes
 * away with that file. Callers that must not accept unauthenticated input —
 * the proxy — should gate on {@link isAuthenticatedPayload} first.
 */

/** 12 bytes is the GCM nonce size every implementation agrees on. */
const GCM_IV_LENGTH = 12;
/** CBC used a full block as the IV. */
const CBC_IV_LENGTH = 16;

/** Marks the authenticated wire format. */
const AUTHENTICATED_PREFIX = "gcm";

const toHex = (bytes: ArrayBuffer | Uint8Array): string =>
  Buffer.from(bytes as Uint8Array).toString("hex");

/**
 * Return type is left to inference on purpose: it widens to
 * `Uint8Array<ArrayBufferLike>` when annotated, which WebCrypto's `BufferSource`
 * no longer accepts.
 */
const fromHex = (value: string) => new Uint8Array(Buffer.from(value, "hex"));

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
 * Whether a ciphertext is in the authenticated (AES-256-GCM) wire format.
 *
 * A caller that treats successful decryption as proof of authenticity has to
 * check this, because {@link decryptPayload} still accepts the unauthenticated
 * legacy format for the one caller that needs it.
 */
export const isAuthenticatedPayload = (payload: string): boolean =>
  payload.startsWith(`${AUTHENTICATED_PREFIX}:`);

/**
 * Encrypts a string payload using AES-256-GCM.
 *
 * The output is in the format:
 * `gcm:<iv>:<ciphertext>`
 *
 * The iv is a 12 byte hex string. The ciphertext is a hex string and carries
 * the 16 byte authentication tag appended to it, as WebCrypto returns it.
 *
 * The secret must be a hex encoded 32 byte key.
 */
export const encryptPayload = async (
  payload: string,
  secret: string,
): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH));

  const key = await crypto.subtle.importKey(
    "raw",
    fromHex(secret),
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt"],
  );

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    new TextEncoder().encode(payload),
  );

  return `${AUTHENTICATED_PREFIX}:${toHex(iv)}:${toHex(encryptedBuffer)}`;
};

const decryptGcm = async (
  ivHex: string,
  ciphertextHex: string,
  secret: string,
): Promise<string> => {
  const iv = fromHex(ivHex);
  if (iv.length !== GCM_IV_LENGTH) {
    throw new Error(
      `AES decryption: Expected a ${GCM_IV_LENGTH} byte IV, got ${iv.length}.`,
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    fromHex(secret),
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["decrypt"],
  );

  // Throws OperationError when the tag does not verify, which is the whole
  // point: a tampered or foreign ciphertext never reaches the caller.
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    fromHex(ciphertextHex),
  );

  return new TextDecoder().decode(decrypted);
};

/**
 * @deprecated Unauthenticated. Only reachable for ciphertext persisted before
 * the switch to GCM; see the module comment.
 */
const decryptLegacyCbc = async (
  ivHex: string,
  ciphertextHex: string,
  secret: string,
): Promise<string> => {
  const iv = fromHex(ivHex);
  if (iv.length !== CBC_IV_LENGTH) {
    throw new Error(
      `AES decryption: Expected a ${CBC_IV_LENGTH} byte IV, got ${iv.length}.`,
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    fromHex(secret),
    {
      name: "AES-CBC",
      length: 256,
    },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-CBC",
      iv,
    },
    key,
    fromHex(ciphertextHex),
  );

  return new TextDecoder().decode(decrypted);
};

/**
 * Decrypts a payload produced by {@link encryptPayload}, and — for the one
 * legacy caller described in the module comment — payloads in the older
 * unauthenticated `<iv>:<ciphertext>` AES-256-CBC format.
 *
 * Throws if the payload is malformed, if the key is wrong, or (for the
 * authenticated format) if a single bit of it has been altered.
 *
 * The secret must be a hex encoded 32 byte key.
 */
export const decryptPayload = async (
  payload: string,
  secret: string,
): Promise<string> => {
  const parts = payload.split(":");

  if (parts.length === 3 && parts[0] === AUTHENTICATED_PREFIX) {
    const [, ivHex, ciphertextHex] = parts;
    if (!ivHex || !ciphertextHex) {
      throw new Error(
        "AES decryption: Payload is malformed. Expected format: gcm:<iv>:<ciphertext>",
      );
    }
    return decryptGcm(ivHex, ciphertextHex, secret);
  }

  if (parts.length === 2) {
    const [ivHex, ciphertextHex] = parts;
    if (!ivHex || !ciphertextHex) {
      throw new Error(
        "AES decryption: Payload is malformed. Expected format: <iv>:<encrypted>",
      );
    }
    return decryptLegacyCbc(ivHex, ciphertextHex, secret);
  }

  throw new Error(
    "AES decryption: Payload is malformed. Expected format: gcm:<iv>:<ciphertext>",
  );
};
