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

/** A blank form field means "not set", so the default applies (TS-24). */
const blankToUndefined = (value: unknown) =>
  value === "" || value === null ? undefined : value;

const count = (min: number, max: number, fallback: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(min).max(max).default(fallback),
  );

/**
 * A switch: a stored boolean, the `"true"`/`"false"` the admin form sends, or
 * the blank string it sends for an unset key, which reads as off.
 * `z.coerce.boolean()` read `"false"` as true (risk C5).
 */
const toggle = () =>
  z.preprocess(
    blankToUndefined,
    z.union([z.boolean(), z.stringbool()]).default(false),
  );

/**
 * The most provider calls one sweep may make, and the largest `callsPerRun`
 * the settings accept. `splitIntoBlocks` refuses a split into more blocks,
 * because no run could afford it.
 */
export const MAX_CALLS_PER_RUN = 500;

/** The settings of an AbuseIPDB installation, as the admin form stores them. */
export const settingsSchema = z.object({
  /** Below this, a reported address is not worth a case. */
  confidenceThreshold: count(0, 100, 50),
  /** The age of the oldest report a check counts, in days. */
  maxAgeInDays: count(1, 365, 30),
  /**
   * The prefix length of the largest block one `check-block` call asks about.
   * A target wider than this is split into blocks of this length
   * (`splitIntoBlocks`); a target as narrow or narrower is asked about as it
   * is. The abuse poller offers /24 targets, so a value below 24 changes
   * nothing, and each step above 24 doubles the calls one target costs.
   */
  blockPrefixLength: count(16, 32, 24),
  /**
   * Provider calls one sweep may make. Four per hourly run is 96 a day, which
   * fits inside a free key's daily `check-block` allowance.
   */
  callsPerRun: count(1, MAX_CALLS_PER_RUN, 4),
  /**
   * Spend an extra call per finding to learn what it was reported for: a case
   * then says "port scan" instead of "other". Off by default, because it
   * doubles the cost of every finding.
   */
  enrichCategories: toggle(),
  /**
   * Whether `AbuseIpDbReputation.report` may publish a report; while false it
   * throws `abuseipdb.reporting_disabled`. A published report affects the
   * whole range's reputation, so a caller must only call `report` after an
   * operator confirmed the case.
   */
  allowReporting: toggle(),
});

/** The secrets of an AbuseIPDB installation: the API key alone. */
export const secretsSchema = z.object({ apiKey: z.string().min(20) });

/** AbuseIPDB's static half (ADR 0003); the runtime is `./index.ts`. */
export const manifest = defineManifest({
  apiVersion: 2,
  id: "abuseipdb",
  version: "2.0.0",
  name: "AbuseIPDB",
  description:
    "Sweeps our own address ranges for reports filed against them, and looks up the reputation of a single address.",
  category: "abuse",
  icon: "abuseipdb",
  author: "Virtbase",
  links: {
    website: "https://www.abuseipdb.com",
    providerDocs: "https://docs.abuseipdb.com/#introduction",
  },
  docs: "./docs",
  requires: { apiVersion: "^2.0.0" },
  provides: ["abuse", "ipReputation"],
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
        help: "The largest block one call asks about, as a prefix length. Wider targets are split into blocks of this size. Targets are /24, so a value below 24 changes nothing and each step above 24 doubles the calls per target.",
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
        help: "Allows reports to be published back to AbuseIPDB. While off, every report is refused.",
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
});
