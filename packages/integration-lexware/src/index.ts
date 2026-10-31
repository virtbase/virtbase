/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { defineIntegration } from "@virtbase/integration-sdk";
import * as z from "zod";
import { LexwareInvoiceProvider } from "./adapter.ts";
import { LexwareClient } from "./client.ts";
import { COUNTRY_CONTACTS, HOME_COUNTRY } from "./constants.ts";
import { localizeLexware } from "./localize.ts";

export * from "./adapter.ts";
export * from "./client.ts";
export * from "./constants.ts";
export * from "./messages.ts";
export * from "./types.ts";

const secretsSchema = z.object({
  apiKey: z.string().min(1),
});

export default defineIntegration({
  id: "lexware",
  name: "Lexware",
  description:
    "Issues customer invoices, and renders the PDFs that are emailed and downloaded.",

  category: "billing",
  icon: "lexware",
  author: "Virtbase",
  website: "https://www.lexware.de",
  docsUrl: "https://developers.lexware.io/docs/",

  secrets: {
    schema: secretsSchema,
    fields: [
      {
        key: "apiKey",
        label: "API key",
        help: "Created under Extras → lexoffice API in Lexware Office.",
        widget: "password",
      },
    ],
  },

  provides: {
    invoice: (ctx) =>
      new LexwareInvoiceProvider(new LexwareClient(ctx.secrets.apiKey)),
  },

  localize: localizeLexware,

  health: async (ctx) => {
    const client = new LexwareClient(ctx.secrets.apiKey);

    try {
      // Cheapest authenticated call: resolve the collective contact that home
      // country invoices are billed against.
      await client.retrieveContact(COUNTRY_CONTACTS[HOME_COUNTRY]);
      return { status: "ok", checkedAt: new Date() };
    } catch (error) {
      return {
        status: "error",
        checkedAt: new Date(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
