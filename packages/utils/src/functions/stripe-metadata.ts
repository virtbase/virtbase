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
 * Stripe limits any individual metadata value to 500 characters. The
 * encrypted configuration snapshot is `iv-hex + ":" + ciphertext-hex`,
 * and hex encoding doubles the byte length, so a modest JSON payload
 * (e.g. a `new_server` snapshot containing a root password) easily
 * overshoots that budget. We work around the limit by splitting the
 * string across multiple metadata keys and reassembling on the
 * webhook side. Stripe permits 50 keys per metadata object so this
 * scheme has comfortable headroom.
 *
 * @see https://docs.stripe.com/api/metadata
 */
const STRIPE_METADATA_VALUE_LIMIT = 500;

/**
 * Splits `value` into Stripe-metadata-sized chunks and returns an object
 * suitable for spreading into a `metadata: {...}` field on any Stripe
 * resource (PaymentIntent, Customer, etc.). The chunks are emitted as
 * `<baseKey>_0`, `<baseKey>_1`, ... alongside a `<baseKey>_count` entry
 * recording the total. Read back with {@link readChunkedStripeMetadata}.
 *
 * Empty strings still produce a `_count: "1"` + `_0: ""` pair so the
 * reader can distinguish "missing" from "present but empty".
 */
export const writeChunkedStripeMetadata = (
  baseKey: string,
  value: string,
): Record<string, string> => {
  const chunks: string[] = [];
  if (value.length === 0) {
    chunks.push("");
  } else {
    for (let i = 0; i < value.length; i += STRIPE_METADATA_VALUE_LIMIT) {
      chunks.push(value.slice(i, i + STRIPE_METADATA_VALUE_LIMIT));
    }
  }
  const out: Record<string, string> = {
    [`${baseKey}_count`]: String(chunks.length),
  };
  chunks.forEach((chunk, index) => {
    out[`${baseKey}_${index}`] = chunk;
  });
  return out;
};

/**
 * Reassembles a value previously written with {@link writeChunkedStripeMetadata}
 * from a Stripe metadata bag. Returns `null` if the chunks aren't present.
 *
 * Falls back to a single-key legacy entry (`metadata[baseKey]`) so any
 * payment intents created before the chunked layout was introduced are
 * still processable.
 *
 * Throws if the chunk count claims more parts than are actually present —
 * this indicates webhook tampering or a half-written metadata bag, and
 * silently truncating would be a security footgun.
 */
export const readChunkedStripeMetadata = (
  metadata: Record<string, string | undefined> | null | undefined,
  baseKey: string,
): string | null => {
  if (!metadata) return null;

  const legacy = metadata[baseKey];
  if (typeof legacy === "string") {
    return legacy;
  }

  const countRaw = metadata[`${baseKey}_count`];
  if (typeof countRaw !== "string") return null;
  const count = Number.parseInt(countRaw, 10);
  if (!Number.isFinite(count) || count < 1) {
    throw new Error(
      `Stripe metadata "${baseKey}_count" is not a valid positive integer: ${countRaw}`,
    );
  }

  let out = "";
  for (let i = 0; i < count; i++) {
    const chunk = metadata[`${baseKey}_${i}`];
    if (typeof chunk !== "string") {
      throw new Error(
        `Stripe metadata missing chunk ${i} of ${count} for "${baseKey}".`,
      );
    }
    out += chunk;
  }
  return out;
};
