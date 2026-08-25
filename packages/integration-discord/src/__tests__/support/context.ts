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

import type { ServerManagementPort } from "@virtbase/ports";
import type {
  APIInteraction,
  APIInteractionResponse,
  APIMessageComponentInteractionData,
  APIModalSubmission,
} from "discord-api-types/v10";
import { ComponentType, InteractionResponseType } from "discord-api-types/v10";

import type { DiscordClient } from "../../api";
import { createDeferred } from "../../handlers/defer";
import type { InteractionContext } from "../../handlers/types";
import { noEmojis, silentLogger } from "./harness";

export interface TestContext {
  ctx: InteractionContext;
  /**
   * The message the deferred work finally produced.
   *
   * Handlers that touch a server acknowledge first and edit afterwards, so the
   * message worth asserting on is not the one the handler returned.
   */
  settled: () => Promise<APIInteractionResponse | null>;
}

/**
 * An interaction context wired to fakes.
 *
 * `deferred` is the real {@link createDeferred}, not a stand-in: its error
 * handling is the reason a failed call becomes a message a customer can read
 * instead of a placeholder that never resolves, and a double that skipped it
 * would be testing a code path that does not exist. Only the HTTP edit is
 * faked, by capturing the body the client was asked to PATCH.
 */
export const testContext = ({
  interaction,
  user = { id: "usr_1", name: "Test", email: "test@example.com" } as never,
  servers,
  params = [],
}: {
  interaction: Partial<APIInteraction> & { data?: unknown };
  user?: InteractionContext["user"];
  servers: ServerManagementPort;
  params?: string[];
}): TestContext => {
  const pending: Promise<unknown>[] = [];
  let edited: unknown = null;

  const discord: DiscordClient = {
    appId: "app_1",
    request: async (method, path, body) => {
      if (method === "PATCH" && path.endsWith("/messages/@original")) {
        edited = body;
      }
      return undefined as never;
    },
  };

  const full = {
    id: "int_1",
    token: "tok",
    locale: "en",
    ...interaction,
  } as APIInteraction;

  const ctx: InteractionContext = {
    interaction: full,
    user,
    locale: "en",
    servers,
    discord,
    emojis: noEmojis,
    logger: silentLogger,
    appId: "app_1",
    params,
    deferred: createDeferred({
      interaction: full,
      locale: "en",
      discord,
      waitUntil: (promise) => pending.push(promise),
      logger: silentLogger,
    }),
  };

  return {
    ctx,
    settled: async () => {
      await Promise.all(pending);
      return edited
        ? ({
            type: InteractionResponseType.UpdateMessage,
            data: edited,
          } as APIInteractionResponse)
        : null;
    },
  };
};

/** Every piece of prose on a response, for asserting what a screen says. */
export const textOf = (response: APIInteractionResponse | null): string => {
  if (!response || !("data" in response) || !response.data) return "";
  const data = response.data as {
    content?: string;
    embeds?: {
      title?: string;
      description?: string;
      author?: { name?: string };
      footer?: { text?: string };
      fields?: { name: string; value: string }[];
    }[];
  };

  return [
    data.content,
    ...(data.embeds ?? []).flatMap((embed) => [
      embed.title,
      embed.description,
      embed.author?.name,
      embed.footer?.text,
      ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
    ]),
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n");
};

/** Every component on a response, flattened out of its rows. */
export const componentsOf = (
  response: APIInteractionResponse | null,
): { custom_id?: string; disabled?: boolean; label?: string }[] => {
  if (!response || !("data" in response) || !response.data) return [];
  const data = response.data as {
    components?: {
      components?: { custom_id?: string; disabled?: boolean; label?: string }[];
    }[];
  };

  return (data.components ?? []).flatMap((row) => row.components ?? []);
};

/** Every `custom_id` a response's components carry. */
export const customIdsOf = (
  response: APIInteractionResponse | null,
): string[] =>
  componentsOf(response)
    .map((component) => component.custom_id)
    .filter((id): id is string => typeof id === "string");

/** The `data` a button interaction carries. */
export const buttonData = (
  customId: string,
): APIMessageComponentInteractionData => ({
  custom_id: customId,
  component_type: ComponentType.Button,
});

/** The `data` a string-select interaction carries. */
export const selectData = (
  customId: string,
  values: string[],
): APIMessageComponentInteractionData => ({
  custom_id: customId,
  component_type: ComponentType.StringSelect,
  values,
});

/**
 * The `data` a submitted modal carries.
 *
 * Built in the shape Discord really sends — each input wrapped in a label —
 * so a test exercises the same tree `modalValue` has to walk.
 */
export const modalData = (
  customId: string,
  fields: Record<string, string>,
): APIModalSubmission => ({
  custom_id: customId,
  components: Object.entries(fields).map(([id, value]) => ({
    type: ComponentType.Label,
    component: {
      type: ComponentType.TextInput,
      custom_id: `input:${id}`,
      value,
    },
  })),
});
