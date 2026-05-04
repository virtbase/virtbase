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

import type { APIInteraction } from "discord-api-types/v10";
import nacl from "tweetnacl";

type VerifyWithNaclArgs = {
  appPublicKey: string;
  rawBody: string;
  signature: string;
  timestamp: string;
};

const verifyWithNacl = ({
  appPublicKey,
  signature,
  rawBody,
  timestamp,
}: VerifyWithNaclArgs) => {
  return nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody),
    Buffer.from(signature, "hex"),
    Buffer.from(appPublicKey, "hex"),
  );
};

type VerifyDiscordRequestResult =
  | { isValid: false }
  | {
      isValid: true;
      interaction: APIInteraction;
    };

/**
 * Verify that the interaction request is from Discord and intended for our bot.
 *
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
 */
export async function verifyInteractionRequest(
  request: Request,
  appPublicKey: string,
): Promise<VerifyDiscordRequestResult> {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (typeof signature !== "string" || typeof timestamp !== "string") {
    return { isValid: false };
  }

  const rawBody = await request.text();
  const isValidRequest =
    signature &&
    timestamp &&
    verifyWithNacl({ appPublicKey, rawBody, signature, timestamp });
  if (!isValidRequest) {
    return { isValid: false };
  }

  return {
    interaction: JSON.parse(rawBody) as APIInteraction,
    isValid: true,
  };
}
