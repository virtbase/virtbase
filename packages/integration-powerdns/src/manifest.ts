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

/** PowerDNS's static half (ADR 0003); the runtime is `./index.ts`. */
export const manifest = defineManifest({
  apiVersion: 2,
  id: "powerdns",
  version: "2.0.0",
  name: "PowerDNS",
  description:
    "Reverse DNS (PTR) management for customer IP allocations, used by the rDNS API and by server deletion.",
  category: "infrastructure",
  icon: "powerdns",
  author: "Virtbase",
  links: {
    website: "https://www.powerdns.com",
    providerDocs: "https://doc.powerdns.com/authoritative/http-api/",
  },
  docs: "./docs",
  requires: { apiVersion: "^2.0.0" },
  provides: ["dns"],
  settings: {
    schema: z.object({ apiUrl: z.url() }),
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
    schema: z.object({ apiKey: z.string().min(1) }),
    fields: [
      {
        key: "apiKey",
        label: "API key",
        help: "Sent as the X-API-Key header.",
        widget: "password",
      },
    ],
  },
});
