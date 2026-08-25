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

import { InteractionType } from "discord-api-types/v10";

import { createDiscordClient } from "../api";
import type { DiscordContext } from "../config";
import { getEmojiResolver } from "../emoji";
import { getInteractionHandler } from "../handlers";
import { createDeferred } from "../handlers/defer";
import type { InteractionContext } from "../handlers/types";
import { getUserByInteraction } from "../utils/get-user-by-interaction";
import { mapDiscordLocale } from "../utils/map-discord-locale";
import { millisecondsSince } from "../utils/snowflake";
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

  // Discord verifies a newly configured endpoint by sending a ping, and does it
  // again whenever the URL changes. Answering before anything else is resolved
  // keeps that check from depending on the database or on a capability being
  // available.
  if (interaction.type === InteractionType.Ping) {
    return Response.json({ type: 1 }, { status: 200 });
  }

  const startedAt = Date.now();

  try {
    const handler = getInteractionHandler(interaction.type);
    const discord = createDiscordClient({
      appId: ctx.settings.appId,
      botToken: ctx.secrets.botToken,
      logger: ctx.logger,
    });
    const locale = mapDiscordLocale(interaction.locale);

    // Nothing here may reach the network. Discord discards an interaction that
    // is not acknowledged within three seconds, so the only work before a
    // handler runs is one database read; the emoji resolver answers from cache
    // and refreshes itself in the background.
    const emojis = getEmojiResolver(discord, ctx.logger);
    const [user, servers] = await Promise.all([
      getUserByInteraction(interaction),
      ctx.ports.require("serverManagement"),
    ]);

    const handlerContext: InteractionContext = {
      interaction,
      user,
      locale,
      servers,
      discord,
      emojis,
      logger: ctx.logger,
      appId: ctx.settings.appId,
      // Commands carry no component parameters; the router fills these in for
      // buttons, selects and modals.
      params: [],
      deferred: createDeferred({
        interaction,
        locale,
        discord,
        waitUntil: ctx.waitUntil,
        logger: ctx.logger,
      }),
    };

    const response = await handler(handlerContext);

    const handled = Date.now() - startedAt;
    const sinceCreated = millisecondsSince(interaction.id);

    if (handled > 2000 || (sinceCreated !== null && sinceCreated > 2000)) {
      ctx.logger.warn("[discord] Interaction was slow to acknowledge", {
        interactionId: interaction.id,
        interactionType: interaction.type,
        handledMs: handled,
        sinceDiscordCreatedMs: sinceCreated,
      });
    }

    return Response.json(response, { status: 200 });
  } catch (error) {
    // Logged with interaction detail here; the dispatcher reports it upstream.
    ctx.logger.error("[discord] Failed to handle interaction", {
      interactionId: interaction.id,
      interactionType: interaction.type,
      handledMs: Date.now() - startedAt,
      sinceDiscordCreatedMs: millisecondsSince(interaction.id),
      error,
    });
    throw error;
  }
}
