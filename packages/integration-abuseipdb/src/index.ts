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

import { defineIntegration } from "@virtbase/integration-sdk";
import { createAbuseIpDbClient } from "./client";
import { secretsSchema, settingsSchema } from "./config";
import { localizeAbuseIpDb } from "./localize";
import { AbuseIpDbReputation } from "./reputation";
import { AbuseIpDbSource } from "./source";

export * from "./categories";
export * from "./client";
export * from "./config";
export * from "./reputation";
export * from "./source";

export default defineIntegration({
  id: "abuseipdb",
  name: "AbuseIPDB",
  description:
    "Sweeps our own address ranges for reports filed against them, and looks up the reputation of a single address.",

  category: "abuse",
  icon: "abuseipdb",
  author: "Virtbase",
  website: "https://www.abuseipdb.com",
  docsUrl: "https://docs.abuseipdb.com/#introduction",

  settings: {
    schema: settingsSchema,
    fields: [
      {
        key: "confidenceThreshold",
        label: "Confidence threshold",
        help: "Below this score, a reported address is ignored.",
        widget: "number",
        placeholder: "50",
      },
      {
        key: "maxAgeInDays",
        label: "Report age",
        help: "How far back the provider should look, in days.",
        widget: "number",
        placeholder: "30",
      },
      {
        key: "blockPrefixLength",
        label: "Block size",
        help: "The smallest block a sweep asks about. A free key is limited to /24.",
        widget: "number",
        placeholder: "24",
      },
      {
        key: "callsPerRun",
        label: "Calls per run",
        help: "Provider calls one sweep may make. Four per hour fits inside a free key's daily allowance.",
        widget: "number",
        placeholder: "4",
      },
      {
        key: "enrichCategories",
        label: "Look up categories",
        help: "Spends an extra call per finding so a case says what it was reported for instead of “other”.",
        widget: "switch",
      },
      {
        key: "allowReporting",
        label: "Allow reporting back",
        help: "Lets an operator publish a report when a case is confirmed. Never automatic.",
        widget: "switch",
      },
    ],
  },

  secrets: {
    schema: secretsSchema,
    fields: [
      {
        key: "apiKey",
        label: "API key",
        help: "Sent as the Key header.",
        widget: "password",
      },
    ],
  },

  provides: {
    abuse: (ctx) => new AbuseIpDbSource(ctx),
    ipReputation: (ctx) => new AbuseIpDbReputation(ctx),
  },

  localize: localizeAbuseIpDb,

  /**
   * One lookup of a documentation address, which proves the key works and
   * reports what is left of today's quota - the number that actually decides
   * whether the sweep will do anything tonight.
   */
  health: async (ctx) => {
    const client = createAbuseIpDbClient({
      apiKey: ctx.secrets.apiKey,
      logger: ctx.logger,
    });

    try {
      await client.check("127.0.0.1", { maxAgeInDays: 1 });
    } catch (error) {
      return {
        status: "error",
        checkedAt: new Date(),
        message: error instanceof Error ? error.message : String(error),
      };
    }

    const remaining = client.quotaRemaining;

    if (null !== remaining && remaining < ctx.settings.callsPerRun) {
      return {
        status: "degraded",
        checkedAt: new Date(),
        message: `Only ${remaining} calls left today; the next sweep will be short.`,
      };
    }

    return { status: "ok", checkedAt: new Date() };
  },
});
