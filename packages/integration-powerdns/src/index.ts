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
import { PowerDnsAdapter } from "./adapter.ts";
import { PowerDNSClient } from "./client.ts";
import { localizePowerDns } from "./localize.ts";

export * from "./adapter.ts";
export * from "./client.ts";
export * from "./utils.ts";

const settingsSchema = z.object({
  apiUrl: z.url(),
});

const secretsSchema = z.object({
  apiKey: z.string().min(1),
});

export default defineIntegration({
  id: "powerdns",
  name: "PowerDNS",
  description:
    "Reverse DNS (PTR) management for customer IP allocations, used by the rDNS API and by server deletion.",

  category: "infrastructure",
  icon: "powerdns",
  author: "Virtbase",
  website: "https://www.powerdns.com",
  docsUrl: "https://doc.powerdns.com/authoritative/http-api/",

  settings: {
    schema: settingsSchema,
    fields: [
      {
        key: "apiUrl",
        label: "API URL",
        help: "Base URL of the PowerDNS HTTP API, without a trailing slash.",
        widget: "url",
        placeholder: "https://ns1.example.com:8081",
      },
    ],
  },

  secrets: {
    schema: secretsSchema,
    fields: [
      {
        key: "apiKey",
        label: "API key",
        help: "Sent as the X-API-Key header.",
        widget: "password",
      },
    ],
  },

  provides: {
    dns: (ctx) =>
      new PowerDnsAdapter(
        new PowerDNSClient({
          apiUrl: ctx.settings.apiUrl,
          apiKey: ctx.secrets.apiKey,
        }),
      ),
  },

  localize: localizePowerDns,

  health: async (ctx) => {
    const client = new PowerDNSClient({
      apiUrl: ctx.settings.apiUrl,
      apiKey: ctx.secrets.apiKey,
    });

    try {
      await client.getServerInfo();
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
