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

import { defineIntegration, defineManifest } from "@virtbase/integration-sdk";
import type { DnsProvider } from "@virtbase/ports";
import { getExtracted } from "next-intl/server";
import * as z from "zod";

/** The example integration's manifest; it passes the conformance suite. */
export const exampleManifest = defineManifest({
  apiVersion: 2,
  id: "example",
  version: "1.0.0",
  name: "Example",
  description: "Exercises the conformance suite.",
  category: "platform",
  docs: "./docs",
  provides: ["dns"],
  settings: {
    schema: z.object({
      apiUrl: z.url(),
      mode: z.enum(["live", "test"]).default("live"),
    }),
    fields: [
      { key: "apiUrl", label: "API URL", widget: "url" },
      {
        key: "mode",
        label: "Mode",
        widget: "select",
        options: [
          { value: "live", label: "Live" },
          { value: "test", label: "Test" },
        ],
      },
    ],
  },
  secrets: {
    schema: z.object({ apiKey: z.string().min(1) }),
    fields: [{ key: "apiKey", label: "API key", widget: "password" }],
  },
});

export const noopDns: DnsProvider = {
  upsertPointerRecord: async () => {},
  deletePointerRecords: async () => {},
};

/** A conforming integration; its health probe asks the provider's /status. */
export const example = defineIntegration(exampleManifest, {
  provides: { dns: () => noopDns },
  health: {
    check: async (ctx) => {
      const response = await ctx.http.request(`${ctx.settings.apiUrl}/status`, {
        headers: { authorization: `Bearer ${ctx.secrets.apiKey}` },
      });
      return response.ok
        ? { status: "ok", checkedAt: new Date() }
        : {
            status: "error",
            checkedAt: new Date(),
            message: `status answered ${response.status}`,
          };
    },
  },
  localize: async () => {
    const t = await getExtracted("example-integration");
    return {
      name: t("Example"),
      description: t("Exercises the conformance suite."),
      fields: {
        apiUrl: { label: t("API URL") },
        mode: { label: t("Mode") },
        apiKey: { label: t("API key") },
      },
    };
  },
});
