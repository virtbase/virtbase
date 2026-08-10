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

import type { PortName } from "@virtbase/ports";
import type {
  FieldDescriptor,
  Integration,
  IntegrationCategory,
  LocalizedIntegrationText,
} from "./types";

/**
 * A plain, serialisable view of an integration.
 *
 * An `Integration` holds Zod schemas and factory functions, none of which
 * survive the server/client boundary. This is what the admin console receives:
 * enough to render a form, and nothing that can be executed.
 */
export interface IntegrationDescription {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  icon: string | null;
  author: string;
  website: string | null;
  docsUrl: string | null;
  internal: boolean;
  settingsFields: FieldDescriptor[];
  secretFields: FieldDescriptor[];
  /** Capability slots this integration fills. */
  ports: PortName[];
  webhooks: { path: string; methods: string[] }[];
  hasHealthCheck: boolean;
}

export const describeIntegration = (
  integration: Integration,
): IntegrationDescription => ({
  id: integration.id,
  name: integration.name,
  description: integration.description,
  category: integration.category,
  icon: integration.icon ?? null,
  author: integration.author ?? "Virtbase",
  website: integration.website ?? null,
  docsUrl: integration.docsUrl ?? null,
  internal: integration.internal ?? false,
  settingsFields: integration.settings?.fields ?? [],
  secretFields: integration.secrets?.fields ?? [],
  ports: Object.keys(integration.provides) as PortName[],
  webhooks: (integration.webhooks ?? []).map((webhook) => ({
    path: webhook.path,
    methods: [...webhook.methods],
  })),
  hasHealthCheck: Boolean(integration.health),
});

const localizeFields = (
  fields: FieldDescriptor[],
  overrides: LocalizedIntegrationText["fields"],
): FieldDescriptor[] => {
  if (!overrides) return fields;

  return fields.map((field) => {
    const override = overrides[field.key];
    return override ? { ...field, ...override } : field;
  });
};

/**
 * Applies an integration's translated text to its description.
 *
 * Merging rather than replacing: a translation that covers only the name still
 * leaves a usable description behind.
 */
export const localizeDescription = (
  description: IntegrationDescription,
  localized: LocalizedIntegrationText,
): IntegrationDescription => ({
  ...description,
  name: localized.name ?? description.name,
  description: localized.description ?? description.description,
  settingsFields: localizeFields(description.settingsFields, localized.fields),
  secretFields: localizeFields(description.secretFields, localized.fields),
});
