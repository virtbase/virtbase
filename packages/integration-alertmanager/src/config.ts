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

import type { IntegrationContext } from "@virtbase/integration-sdk";
import * as z from "zod";

export const PAYLOAD_FORMATS = ["alertmanager", "grafana", "generic"] as const;

export const settingsSchema = z.object({
  /**
   * Which shape the sender speaks.
   *
   * `grafana` is `alertmanager` plus the extras Grafana adds - it is a separate
   * option rather than sniffing, because guessing wrong on an alerting path
   * fails silently and at the worst possible moment.
   */
  payloadFormat: z.enum(PAYLOAD_FORMATS).default("alertmanager"),
  /**
   * The severity used when an alert carries no `severity` label.
   *
   * Defaults to `warning` rather than `critical`: an alert nobody labelled is
   * more often a rule somebody forgot to finish than an emergency.
   */
  defaultSeverity: z.enum(["info", "warning", "critical"]).default("warning"),
});

export const secretsSchema = z.object({
  /**
   * Sent as `Authorization: Bearer`. Required rather than optional - this
   * endpoint opens abuse cases, and an unauthenticated one would let anybody
   * suspend a customer.
   */
  ingestToken: z.string().min(16),
});

export type AlertmanagerSettings = z.output<typeof settingsSchema>;
export type AlertmanagerSecrets = z.output<typeof secretsSchema>;

export type AlertmanagerContext = IntegrationContext<
  AlertmanagerSettings,
  AlertmanagerSecrets
>;
