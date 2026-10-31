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

import { decryptPayload, isAuthenticatedPayload } from "@virtbase/utils";
import type { WebSocketData } from "@virtbase/validators";
import { WebsocketDataSchema } from "@virtbase/validators";

export const ExpiryLimit = {
  /**
   * Clock drift allowed between the web app that minted a payload and this
   * proxy, so a proxy a few seconds behind still accepts a fresh one.
   */
  clockSkewSeconds: 30,
  /**
   * The web app asks for minutes. An expiry hours away is either a bug or a
   * payload meant never to die, and neither is honoured.
   */
  maxLifetimeSeconds: 60 * 60,
} as const;

/**
 * The reason a payload was refused is for the log only. The caller gives every
 * refusal the same response, so probing tells an attacker nothing about which
 * part of a forgery failed.
 */
export type VerifiedPayload =
  | { ok: true; data: WebSocketData }
  | { ok: false; reason: string };

const refuse = (reason: string): VerifiedPayload => ({ ok: false, reason });

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * Turns the `?payload=` query parameter into the console it names.
 *
 * Which host the proxy dials and which credential it presents both come out of
 * this blob, so it is only trusted because it authenticates under the shared
 * key. The legacy CBC format is malleable, so it is refused before it reaches
 * the cipher: whatever it decrypts to proves nothing.
 */
export const verifyPayload = async (
  payload: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<VerifiedPayload> => {
  if (!isAuthenticatedPayload(payload)) {
    return refuse("not in the authenticated format");
  }

  const plaintext = await decryptPayload(payload, secret).catch(
    () => undefined,
  );
  if (plaintext === undefined) {
    return refuse("decryption or authentication failed");
  }

  const parsed = WebsocketDataSchema.safeParse(parseJson(plaintext));
  if (!parsed.success) {
    return refuse("plaintext is not a console payload");
  }

  const { exp } = parsed.data;
  if (exp + ExpiryLimit.clockSkewSeconds <= now) {
    return refuse("expired");
  }
  if (exp > now + ExpiryLimit.maxLifetimeSeconds) {
    return refuse("expires implausibly far in the future");
  }

  return { ok: true, data: parsed.data };
};
