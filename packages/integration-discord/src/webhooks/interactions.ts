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

import type { DiscordContext } from "../config";
import { getInteractionHandler } from "../handlers";
import { getUserByInteraction } from "../utils/get-user-by-interaction";
import { verifyInteractionRequest } from "../utils/verify-incoming-request";

/**
 * Discord's interactions endpoint.
 *
 * The signature is checked here, against the raw body, before anything else
 * happens — Discord also sends unsigned probes, and it deregisters the endpoint
 * if an unsigned request is answered with anything but a 401.
 */
export async function handleInteractionsRequest(
  request: Request,
  ctx: DiscordContext,
): Promise<Response> {
  const verifyResult = await verifyInteractionRequest(
    request,
    ctx.secrets.publicKey,
  );

  if (!verifyResult.isValid || !verifyResult.interaction) {
    return new Response("Invalid request.", { status: 401 });
  }

  const { interaction } = verifyResult;

  try {
    const handler = getInteractionHandler(interaction.type);
    const user = await getUserByInteraction(interaction);
    const servers = await ctx.ports.require("serverManagement");

    const result = await handler({ interaction, user, servers });

    return Response.json(result, { status: 200 });
  } catch (error) {
    // Logged with interaction detail here; the dispatcher reports it upstream.
    ctx.logger.error("[discord] Failed to handle interaction", {
      interactionId: interaction.id,
      interactionType: interaction.type,
      error,
    });
    throw error;
  }
}
