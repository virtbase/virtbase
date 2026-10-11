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

import type { IntegrationManifest } from "@virtbase/integration-sdk/manifest";
import type { FormDescriptor } from "@virtbase/ports";
import * as z from "zod";

/**
 * The problems of a manifest's settings and secrets descriptors (§4.7, check 2
 * of integration-first.md), as {@link checkFormDescriptor} finds them, with
 * every secret field held to the `password` widget (INT-7).
 */
export const checkFields = (manifest: IntegrationManifest): string[] => [
  ...checkFormDescriptor({ label: "settings", descriptor: manifest.settings }),
  ...checkFormDescriptor({
    label: "secrets",
    descriptor: manifest.secrets,
    secretKeys: manifest.secrets?.fields.map((field) => field.key),
  }),
];

/**
 * The problems of one form descriptor, each prefixed with `label`:
 *
 * - a schema that is not a `z.object`;
 * - a schema key without a field, or a field without a schema key;
 * - a `select` field whose options differ from its schema's enum values;
 * - a key of `secretKeys` that has no field, or whose field does not use the
 *   `password` widget.
 */
export const checkFormDescriptor = ({
  label,
  descriptor,
  secretKeys = [],
}: {
  label: string;
  descriptor: FormDescriptor | undefined;
  secretKeys?: readonly string[];
}): string[] => {
  if (!descriptor) return [];
  const shape = readShape(descriptor.schema);
  if (!shape) return [`${label}: the schema must be a z.object`];

  const schemaKeys = Object.keys(shape).sort();
  const fieldKeys = descriptor.fields.map((field) => field.key).sort();
  const problems = [
    ...schemaKeys
      .filter((key) => !fieldKeys.includes(key))
      .map((key) => `${label}: schema key ${key} has no field`),
    ...fieldKeys
      .filter((key) => !schemaKeys.includes(key))
      .map((key) => `${label}: field ${key} has no schema key`),
    ...secretKeys
      .filter((key) => !fieldKeys.includes(key))
      .map((key) => `${label}: secret key ${key} has no field`),
  ];

  for (const field of descriptor.fields) {
    if (secretKeys.includes(field.key) && field.widget !== "password") {
      problems.push(
        `${label}: field ${field.key} must use the password widget`,
      );
    }
    const entry = shape[field.key];
    if (field.widget !== "select" || !entry) continue;
    const values = readEnumValues(entry);
    const options = (field.options ?? []).map((option) => option.value).sort();
    if (!values) {
      problems.push(`${label}: select field ${field.key} needs an enum schema`);
    } else if (values.join(",") !== options.join(",")) {
      problems.push(
        `${label}: select field ${field.key} offers [${options.join(", ")}] but the schema allows [${values.join(", ")}]`,
      );
    }
  }
  return problems;
};

const readShape = (schema: z.ZodType): Record<string, z.ZodType> | null =>
  schema instanceof z.ZodObject ? schema.shape : null;

/**
 * The values of an enum schema, sorted, through `optional`, `nullable`,
 * `default` and the output side of a pipe; null for any other schema.
 */
const readEnumValues = (schema: z.ZodType): string[] | null => {
  let current: unknown = schema;
  for (;;) {
    if (current instanceof z.ZodEnum) {
      return current.options.map(String).sort();
    }
    if (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault
    ) {
      current = current.unwrap();
    } else if (current instanceof z.ZodPipe) {
      current = current.out;
    } else {
      return null;
    }
  }
};
