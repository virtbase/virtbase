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

/**
 * The outgoing-webhooks integration's static half (ADR 0003). It has no
 * settings and no secrets of its own: everything a webhook needs belongs to a
 * destination, and destinations are notification targets, not installation
 * configuration. Enabling it switches the whole channel on.
 */
export const manifest = defineManifest({
  apiVersion: 2,
  id: "webhook",
  version: "2.0.0",
  name: "Outgoing webhooks",
  description:
    "Delivers operator notifications as signed JSON to any endpoint. The way to reach Slack, Teams or an automation tool without a dedicated integration.",
  category: "communication",
  icon: "webhook",
  author: "Virtbase",
  docs: "./docs",
  requires: { apiVersion: "^2.0.0" },
  provides: ["notifications"],
});
