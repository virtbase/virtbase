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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { captureException } from "@sentry/nextjs";
import { appRouter, generateOpenApiDocument } from "@virtbase/api";
import {
  APP_DOMAIN,
  APP_NAME,
  PUBLIC_DOMAIN,
  SUPPORT_EMAIL,
} from "@virtbase/utils";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";

/**
 * Read a markdown file from the `src/app/api/docs` directory
 *
 * @param file The file to read
 * @returns The content of the file or an empty string if the file does not exist
 */
const readMarkdown = async (file: string) => {
  try {
    return await readFile(join(process.cwd(), "src/app/api/docs", file), {
      encoding: "utf-8",
    });
  } catch (error) {
    captureException(error);

    // Fallback to an empty string to allow the documentation
    // to be displayed even if the file does not exist
    return "";
  }
};

/**
 * The public API's OpenAPI document, with the prose for its description and
 * tags read from the Markdown next to this file. Rendered by the reference
 * page and served as JSON at `/api/openapi.json`.
 */
export const getOpenApiDocument = cache(async () => {
  "use cache";

  cacheTag("api-docs");
  cacheLife("max");

  const doc = generateOpenApiDocument(appRouter, {
    title: `${APP_NAME} Public API`,
    description: await readMarkdown("description.md"),
    version: "1.0.0",
    baseUrl: `${PUBLIC_DOMAIN}/api/v1`,
    securitySchemes: {
      "X-Virtbase-API-Key": {
        type: "apiKey",
        in: "header",
        name: "X-Virtbase-API-Key",
        description: `Obtain from your account settings at ${APP_DOMAIN}/account/settings/api.`,
      },
    },
  });

  Object.assign(doc, {
    info: {
      ...doc.info,
      contact: {
        name: APP_NAME,
        url: `${PUBLIC_DOMAIN}/contact`,
        email: SUPPORT_EMAIL,
      },
    },
    tags: await Promise.all(
      [
        { name: "Servers", file: "servers.md" },
        { name: "rDNS", file: "rdns.md" },
        { name: "Backups", file: "backups.md" },
        { name: "Firewall", file: "firewall.md" },
        { name: "SSH Keys", file: "ssh-keys.md" },
        { name: "ISO", file: "iso.md" },
        { name: "Invoices", file: "invoices.md" },
        { name: "Offers", file: "offers.md" },
      ].map(async (tag) => ({
        name: tag.name,
        description: await readMarkdown(`tags/${tag.file}`),
      })),
    ),
    "x-tagGroups": [
      {
        name: "Server Resources",
        tags: ["Servers", "rDNS", "Backups", "Firewall"],
      },
      {
        name: "Account",
        tags: ["SSH Keys", "Invoices", "ISO"],
      },
      {
        name: "Public",
        tags: ["Offers"],
      },
    ],
  });

  return doc;
});
