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

import { decryptPayload, isAuthenticatedPayload } from "@virtbase/utils";
import type { WebSocketData } from "@virtbase/validators";
import { WebsocketDataSchema } from "@virtbase/validators";

/**
 * Allowance for clock drift between the machine that minted the payload and
 * this one. Without it a proxy a few seconds behind rejects console URLs that
 * were valid when they were issued.
 */
const CLOCK_SKEW_TOLERANCE_SECONDS = 30;

/**
 * The furthest into the future an expiry may sit. The minting side asks for
 * minutes; anything claiming hours is either a bug or an attempt to mint a
 * payload that never dies, and neither should be honoured.
 */
const MAX_LIFETIME_SECONDS = 60 * 60;

/**
 * Raised for every reason a payload can be refused.
 *
 * Deliberately one type with one message shape: the caller turns it into a
 * single generic response, so a tampered ciphertext, a payload for a schema we
 * no longer accept and an expired one are indistinguishable from outside. The
 * `reason` is for the server's own logs.
 */
export class InvalidPayloadError extends Error {
  constructor(readonly reason: string) {
    super("Invalid payload");
    this.name = "InvalidPayloadError";
  }
}

/**
 * Turns the `?payload=` query parameter into trusted connection data.
 *
 * Everything the proxy goes on to do — which host it dials, which credential it
 * presents — comes out of this blob, so it is only safe to the extent that this
 * function is. Three things have to hold:
 *
 *   1. the ciphertext is in the authenticated format. The legacy CBC format is
 *      refused outright rather than decrypted, because a malleable ciphertext
 *      handed back by the client is not evidence of anything;
 *   2. it decrypts and authenticates under the shared key, which is what makes
 *      the `host` field safe to dial;
 *   3. it has not expired.
 */
export const verifyPayload = async ({
  payload,
  secret,
  now = Date.now(),
}: {
  payload: string;
  secret: string;
  now?: number;
}): Promise<WebSocketData> => {
  if (!isAuthenticatedPayload(payload)) {
    throw new InvalidPayloadError("unauthenticated ciphertext format");
  }

  let plaintext: string;
  try {
    plaintext = await decryptPayload(payload, secret);
  } catch {
    throw new InvalidPayloadError("decryption or authentication failed");
  }

  let json: unknown;
  try {
    json = JSON.parse(plaintext);
  } catch {
    throw new InvalidPayloadError("plaintext is not JSON");
  }

  const parsed = await WebsocketDataSchema.safeParseAsync(json);
  if (!parsed.success) {
    throw new InvalidPayloadError("payload does not match the schema");
  }

  const nowSeconds = Math.floor(now / 1000);

  if (parsed.data.exp + CLOCK_SKEW_TOLERANCE_SECONDS <= nowSeconds) {
    throw new InvalidPayloadError("payload has expired");
  }

  if (parsed.data.exp > nowSeconds + MAX_LIFETIME_SECONDS) {
    throw new InvalidPayloadError("payload expires implausibly far in future");
  }

  return parsed.data;
};
