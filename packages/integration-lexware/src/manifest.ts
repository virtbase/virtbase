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

import { defineManifest } from "@virtbase/integration-sdk/manifest";
import * as z from "zod";

/** The API key, the only secret. */
export const secretsSchema = z.object({ apiKey: z.string().min(1) });

/** Lexware's static half (ADR 0003); the runtime is `./index.ts`. */
export const manifest = defineManifest({
  apiVersion: 2,
  id: "lexware",
  version: "2.0.0",
  name: "Lexware",
  description:
    "Issues customer invoices, and renders the PDFs that are emailed and downloaded.",
  category: "billing",
  icon: "lexware",
  author: "Virtbase",
  links: {
    website: "https://www.lexware.de",
    providerDocs: "https://developers.lexware.io/docs/",
  },
  docs: "./docs",
  requires: { apiVersion: "^2.0.0" },
  provides: ["invoice"],
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
});
