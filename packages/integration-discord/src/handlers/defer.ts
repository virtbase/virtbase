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

import { ServerManagementError } from "@virtbase/ports";
import type {
  APIInteraction,
  APIInteractionResponse,
  RESTPatchAPIInteractionOriginalResponseJSONBody,
} from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import type { Locale } from "next-intl";

import type { DiscordClient } from "../api";
import { editOriginalResponse } from "../api";
import { ErrorMessage } from "../messages/error";
import type { Deferred } from "./types";

/**
 * Builds the {@link Deferred} put on every interaction context.
 *
 * The acknowledgement goes back inside Discord's three-second window; the real
 * work runs through `waitUntil`, which the dispatcher backs with Next's
 * `after()`, and then replaces the placeholder message.
 *
 * A rejection is reported to the customer rather than thrown: by the time the
 * work runs the response is already sent, so throwing would leave a permanent
 * "thinking..." message and nothing else.
 */
export const createDeferred = ({
  interaction,
  locale,
  discord,
  waitUntil,
  logger,
}: {
  interaction: APIInteraction;
  locale: Locale;
  discord: DiscordClient;
  waitUntil: (promise: Promise<unknown>) => void;
  logger: { error(message: string, fields?: Record<string, unknown>): void };
}): Deferred => {
  const finish = async (work: () => Promise<APIInteractionResponse>) => {
    let response: APIInteractionResponse;
    try {
      response = await work();
    } catch (error) {
      logger.error("[discord] Deferred interaction work failed", {
        interactionId: interaction.id,
        // The port's own classification, which is what decides the message the
        // customer gets. Without it a log line cannot be matched to the screen.
        code: error instanceof ServerManagementError ? error.code : undefined,
        error: error instanceof Error ? error.message : String(error),
        cause:
          error instanceof Error && error.cause instanceof Error
            ? error.cause.message
            : undefined,
      });
      response = await ErrorMessage({ locale, error });
    }

    // Every builder returns a full response; the edit endpoint wants only its
    // body, which is what makes the builders reusable in both modes. A modal or
    // an autocomplete answer cannot be deferred, so a response carrying one of
    // those bodies is a programming error rather than something to send.
    if (!("data" in response) || !response.data) return;
    if (!("embeds" in response.data) && !("content" in response.data)) {
      logger.error("[discord] A deferred handler returned a non-message body", {
        interactionId: interaction.id,
      });
      return;
    }

    const body =
      response.data as RESTPatchAPIInteractionOriginalResponseJSONBody;

    await editOriginalResponse(discord, interaction.token, body).catch(
      (error: unknown) => {
        logger.error("[discord] Could not edit the deferred response", {
          interactionId: interaction.id,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );
  };

  return (work, options = {}) => {
    waitUntil(finish(work));

    return options.update
      ? { type: InteractionResponseType.DeferredMessageUpdate }
      : {
          type: InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: MessageFlags.Ephemeral },
        };
  };
};
