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

import type { DnsProvider } from "@virtbase/ports";
import * as z from "zod";
import type { ConfigSource } from "../config-source";
import { defineManifest } from "../manifest";
import type { IntegrationLogger } from "../types";

/** A complete v2 manifest the SDK's tests declare integrations from. */
export const acmeManifest = defineManifest({
  apiVersion: 2,
  id: "acme-dns",
  version: "1.0.0",
  name: "Acme DNS",
  description: "Reverse DNS at Acme.",
  category: "infrastructure",
  docs: "./docs",
  links: {
    website: "https://acme.example",
    providerDocs: "https://acme.example/docs",
  },
  requires: { apiVersion: "^2.0.0" },
  provides: ["dns"],
  settings: {
    schema: z.object({ zone: z.string() }),
    fields: [{ key: "zone", label: "Zone", widget: "text" }],
  },
  secrets: {
    schema: z.object({ apiKey: z.string() }),
    fields: [{ key: "apiKey", label: "API key", widget: "password" }],
  },
  http: { timeoutMs: 20 },
});

export const fakeDns: DnsProvider = {
  upsertPointerRecord: async () => {},
  deletePointerRecords: async () => {},
};

export const silentLogger: IntegrationLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** An enabled acme installation with valid settings and secrets. */
export const acmeConfig: ConfigSource = {
  isEnabled: async () => true,
  settings: async () => ({ zone: "10.in-addr.arpa" }),
  secrets: async () => ({ apiKey: "acme-key-123" }),
};
