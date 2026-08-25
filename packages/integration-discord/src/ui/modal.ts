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

import { truncate } from "@virtbase/utils";
import type {
  APIModalInteractionResponse,
  APIModalInteractionResponseCallbackData,
  APIModalSubmissionComponent,
  APITextInputComponent,
  ModalSubmitComponent,
} from "discord-api-types/v10";
import {
  ComponentType,
  InteractionResponseType,
  TextInputStyle,
} from "discord-api-types/v10";

import { encodeCustomId } from "../routing";

const TITLE_MAX = 45;
/**
 * Discord accepts between one and five components in a modal, counting a note
 * as one of them. Exceeding it is not an error anyone sees — the modal simply
 * never opens, and the interaction looks like it did nothing at all.
 */
const COMPONENTS_MAX = 5;
const LABEL_MAX = 45;
const DESCRIPTION_MAX = 100;

export interface TextField {
  /** Read back with {@link modalValue}. */
  id: string;
  label: string;
  description?: string;
  placeholder?: string;
  value?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  paragraph?: boolean;
}

/**
 * A form.
 *
 * Discord's modal is the only way to take free text, and it must be the direct
 * answer to an interaction — it cannot be opened from a deferred response.
 * Handlers that open one therefore never defer.
 */
export const modal = ({
  feature,
  action,
  params,
  title,
  note,
  fields,
}: {
  feature: string;
  action: string;
  params?: string[];
  title: string;
  /** Rendered above the fields, for a warning the form itself cannot carry. */
  note?: string;
  fields: TextField[];
}): APIModalInteractionResponse => {
  const components: APIModalInteractionResponseCallbackData["components"] = [
    ...(note
      ? [{ type: ComponentType.TextDisplay as const, content: note }]
      : []),
    ...fields.map((field) => ({
      type: ComponentType.Label as const,
      label: truncate(field.label, LABEL_MAX) as string,
      ...(field.description
        ? {
            description: truncate(field.description, DESCRIPTION_MAX) as string,
          }
        : {}),
      component: {
        type: ComponentType.TextInput as const,
        custom_id: `input:${field.id}`,
        style: field.paragraph
          ? TextInputStyle.Paragraph
          : TextInputStyle.Short,
        required: field.required ?? true,
        ...(field.minLength === undefined
          ? {}
          : { min_length: field.minLength }),
        ...(field.maxLength === undefined
          ? {}
          : { max_length: field.maxLength }),
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
        ...(field.value ? { value: field.value } : {}),
      } satisfies APITextInputComponent,
    })),
  ];

  if (components.length === 0 || components.length > COMPONENTS_MAX) {
    throw new Error(
      `[@virtbase/discord] A modal takes 1 to ${COMPONENTS_MAX} components, "${feature}:${action}" has ${components.length}${
        note ? " (the note counts as one)" : ""
      }`,
    );
  }

  return {
    type: InteractionResponseType.Modal,
    data: {
      title: truncate(title, TITLE_MAX) as string,
      custom_id: encodeCustomId({ kind: "modal", feature, action, params }),
      components,
    },
  };
};

/**
 * Reads a submitted field by the id it was declared with.
 *
 * Discord returns the submission as a tree: an action row holds inputs
 * directly, a label wraps exactly one, and a text display holds nothing.
 * Indexing into it positionally broke the moment a field was inserted anywhere
 * but the end, so this walks it by id instead — which is what makes a form's
 * fields reorderable without touching its handler.
 */
export const modalValue = (
  components: readonly APIModalSubmissionComponent[] | undefined,
  id: string,
): string | null => {
  const wanted = `input:${id}`;

  const walk = (
    nodes: readonly (APIModalSubmissionComponent | ModalSubmitComponent)[],
  ): string | null => {
    for (const node of nodes) {
      if (node.type === ComponentType.TextInput && node.custom_id === wanted) {
        return node.value;
      }

      if (node.type === ComponentType.Label) {
        const found = walk([node.component]);
        if (found !== null) return found;
      }

      if (node.type === ComponentType.ActionRow) {
        const found = walk(node.components);
        if (found !== null) return found;
      }
    }

    return null;
  };

  return components ? walk(components) : null;
};
