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

export const settingsSchema = z.object({
  /** Below this, a reported address is not worth a case. */
  confidenceThreshold: z.coerce.number().int().min(0).max(100).default(50),
  /** How far back the provider should look. */
  maxAgeInDays: z.coerce.number().int().min(1).max(365).default(30),
  /**
   * The smallest block the sweep asks about.
   *
   * `check-block` is capped by plan - /24 on a free key, wider on a paid one -
   * and asking for something wider than the key allows fails the call rather
   * than degrading.
   */
  blockPrefixLength: z.coerce.number().int().min(16).max(32).default(24),
  /**
   * Provider calls one sweep may make.
   *
   * Four per hourly run is 96 a day, which fits inside a free key's daily
   * `check-block` allowance with room to spare. Raise it with the plan.
   */
  callsPerRun: z.coerce.number().int().min(1).max(500).default(4),
  /**
   * Spend an extra call per finding to learn what it was reported for.
   *
   * Off by default: it doubles the cost of every finding. On, a case says
   * "port scan" instead of "other", which is the difference between a customer
   * knowing what to fix and writing back to ask.
   */
  enrichCategories: z.coerce.boolean().default(false),
  /**
   * Offer to report confirmed abuse back to AbuseIPDB.
   *
   * Only ever an offer. Publishing a report against an address has
   * consequences for the whole range's reputation, so it stays behind an
   * operator's explicit confirmation on a resolved case.
   */
  allowReporting: z.coerce.boolean().default(false),
});

export const secretsSchema = z.object({
  apiKey: z.string().min(20),
});

export type AbuseIpDbSettings = z.output<typeof settingsSchema>;
export type AbuseIpDbSecrets = z.output<typeof secretsSchema>;

export type AbuseIpDbContext = IntegrationContext<
  AbuseIpDbSettings,
  AbuseIpDbSecrets
>;
