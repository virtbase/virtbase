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

import type { LocalizedIntegrationText } from "@virtbase/integration-sdk";
import { getExtracted } from "next-intl/server";

/**
 * Admin console text for this integration.
 *
 * The literals live here, rather than being passed a translator, because
 * next-intl extracts from `getExtracted` call sites — a `t` received as an
 * argument is invisible to it.
 */
export const localizeAbuseIpDb =
  async (): Promise<LocalizedIntegrationText> => {
    const t = await getExtracted();

    return {
      name: t("AbuseIPDB"),
      description: t(
        "Sweeps our own address ranges for reports filed against them, and looks up the reputation of a single address.",
      ),
      fields: {
        confidenceThreshold: {
          label: t("Confidence threshold"),
          help: t("Below this score, a reported address is ignored."),
        },
        maxAgeInDays: {
          label: t("Report age"),
          help: t("How far back the provider should look, in days."),
        },
        blockPrefixLength: {
          label: t("Block size"),
          help: t(
            "The smallest block a sweep asks about. A free key is limited to /24.",
          ),
        },
        callsPerRun: {
          label: t("Calls per run"),
          help: t(
            "Provider calls one sweep may make. Four per hour fits inside a free key's daily allowance.",
          ),
        },
        enrichCategories: {
          label: t("Look up categories"),
          help: t(
            "Spends an extra call per finding so a case says what it was reported for instead of “other”.",
          ),
        },
        allowReporting: {
          label: t("Allow reporting back"),
          help: t(
            "Lets an operator publish a report when a case is confirmed. Never automatic.",
          ),
        },
        apiKey: {
          label: t("API key"),
          help: t("Sent as the Key header."),
        },
      },
    };
  };
