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

import "@scalar/api-reference-react/style.css";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ApiReferenceReact } from "@scalar/api-reference-react";
import { captureException } from "@sentry/nextjs";
import { appRouter, generateOpenApiDocument } from "@virtbase/api";
import {
  APP_DOMAIN,
  APP_NAME,
  constructMetadata,
  constructOpengraphUrl,
  PUBLIC_DOMAIN,
  SUPPORT_EMAIL,
} from "@virtbase/utils";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import Document from "@/ui/document";

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

const getDocumentation = cache(async () => {
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
        tags: ["SSH Keys", "Invoices"],
      },
      {
        name: "Public",
        tags: ["Offers"],
      },
    ],
  });

  return doc;
});

const title = `${APP_NAME} Public API`;
const description = `Documentation for the ${APP_NAME} Public API`;

export const metadata: Metadata = constructMetadata({
  title,
  description,
  canonicalUrl: `${PUBLIC_DOMAIN}/api/docs`,
  image: constructOpengraphUrl({
    title,
    subtitle: description,
    slug: "/api/docs",
    theme: "dark",
  }),
});

export default async function Page() {
  return (
    <Document locale="en">
      <ApiReferenceReact
        configuration={{
          _integration: "nextjs",
          agent: {
            disabled: true,
          },
          authentication: {
            // This preselects the "X-Virtbase-API-Key" authentication method in the UI
            preferredSecurityScheme: "X-Virtbase-API-Key",
            // Only show "X-Virtbase-API-Key" as valid authentication method
            createAnySecurityScheme: false,
          },
          content: await getDocumentation(),
          darkMode: true,
          defaultOpenAllTags: false,
          forceDarkModeState: "dark",
          hideClientButton: true,
          hideDarkModeToggle: true,
          mcp: {
            // Hide `Generate MCP` buttons
            disabled: true,
          },
          // Keep the order of the schema instead of sorting alphabetically
          // This makes id fields come first in the schema
          orderSchemaPropertiesBy: "preserve",
          showDeveloperTools: "never",
          telemetry: false,
          // Prevent loading fonts from fonts.scalar.com, and use the default fonts from the document
          withDefaultFonts: false,
          customCss: `* { font-family: var(--font-geist-sans); }`,
        }}
      />
    </Document>
  );
}
