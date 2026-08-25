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

/** Which interaction table a custom id belongs to. */
export type ComponentKind = "button" | "select" | "modal";

export interface CustomId {
  kind: ComponentKind;
  /** Feature that owns the handler, e.g. `servers` or `backups`. */
  feature: string;
  action: string;
  /** Positional arguments, usually ids. */
  params: string[];
}

/**
 * Discord's hard limit on `custom_id`. Exceeding it is a 400 on the message
 * that carries the component, which surfaces as a button that was never drawn
 * rather than as an error anyone can read — so it is asserted here instead.
 */
export const MAX_CUSTOM_ID_LENGTH = 100;

const FIELD_SEPARATOR = ":";
const PARAM_SEPARATOR = "|";

export class CustomIdError extends Error {
  constructor(message: string) {
    super(`[@virtbase/discord] ${message}`);
    this.name = "CustomIdError";
  }
}

/**
 * Builds the `custom_id` a component carries.
 *
 * Components are stateless: Discord hands back only this string, so everything
 * a handler needs to act — which server, which backup — has to be encoded in
 * it. That is why ids are positional parameters rather than a JSON blob, which
 * would not fit in a hundred characters.
 */
export const encodeCustomId = ({
  kind,
  feature,
  action,
  params = [],
}: Omit<CustomId, "params"> & { params?: string[] }): string => {
  for (const [label, value] of [
    ["feature", feature],
    ["action", action],
  ] as const) {
    if (value.includes(FIELD_SEPARATOR) || value.includes(PARAM_SEPARATOR)) {
      throw new CustomIdError(
        `A custom id ${label} may not contain "${FIELD_SEPARATOR}" or "${PARAM_SEPARATOR}", got "${value}"`,
      );
    }
  }

  for (const param of params) {
    if (param.includes(PARAM_SEPARATOR)) {
      throw new CustomIdError(
        `A custom id parameter may not contain "${PARAM_SEPARATOR}", got "${param}"`,
      );
    }
  }

  const encoded = [
    kind,
    feature,
    action,
    ...(params.length > 0 ? [params.join(PARAM_SEPARATOR)] : []),
  ].join(FIELD_SEPARATOR);

  if (encoded.length > MAX_CUSTOM_ID_LENGTH) {
    throw new CustomIdError(
      `Custom id "${encoded}" is ${encoded.length} characters, over Discord's ${MAX_CUSTOM_ID_LENGTH} limit`,
    );
  }

  return encoded;
};

/**
 * Reads a `custom_id` back.
 *
 * Returns `null` rather than throwing for anything unrecognised: a component
 * from a message this bot sent before a deploy is a stale button, not a bug,
 * and the dispatcher answers those with the main menu.
 */
export const decodeCustomId = (
  customId: string,
  expected?: ComponentKind,
): CustomId | null => {
  const [kind, feature, action, params] = customId.split(FIELD_SEPARATOR);

  if (kind !== "button" && kind !== "select" && kind !== "modal") return null;
  if (expected && kind !== expected) return null;
  if (!feature || !action) return null;

  return {
    kind,
    feature,
    action,
    params: params ? params.split(PARAM_SEPARATOR) : [],
  };
};

/** `feature:action`, the key a handler table is looked up by. */
export const routeKey = (id: Pick<CustomId, "feature" | "action">): string =>
  `${id.feature}${FIELD_SEPARATOR}${id.action}`;
