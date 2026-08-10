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

import type * as z from "zod";
import type { Integration, IntegrationDefinition } from "./types";

/**
 * Declares an integration. The only job of this function is inference: it keeps
 * `settings.schema` and `secrets.schema` tied to the `ctx.settings` /
 * `ctx.secrets` types seen inside `provides`, `health` and the lifecycle hooks,
 * so an adapter cannot read a setting the schema does not declare.
 *
 * ```ts
 * export default defineIntegration({
 *   id: "powerdns",
 *   name: "PowerDNS",
 *   description: "Reverse DNS for customer IPs.",
 *   settings: { schema: z.object({ apiUrl: z.url() }), fields: [...] },
 *   secrets:  { schema: z.object({ apiKey: z.string() }), fields: [...] },
 *   provides: { dns: (ctx) => new PowerDnsAdapter(ctx) },
 * });
 * ```
 */
export function defineIntegration<
  TSettingsSchema extends z.ZodType,
  TSecretsSchema extends z.ZodType,
>(
  definition: IntegrationDefinition<TSettingsSchema, TSecretsSchema>,
): Integration {
  return definition as unknown as Integration;
}
