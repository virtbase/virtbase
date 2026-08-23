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
 * argument is invisible to it. This package must therefore appear in
 * `experimental.srcPath` in `apps/web/next.config.ts`, or the whole namespace
 * silently disappears from the message catalogue.
 */
export const localizePrometheus =
  async (): Promise<LocalizedIntegrationText> => {
    const t = await getExtracted();

    return {
      name: t("Prometheus"),
      description: t(
        "Exposes platform and runtime metrics on an authenticated scrape endpoint for Prometheus and Grafana.",
      ),
      fields: {
        prefix: {
          label: t("Metric prefix"),
          help: t(
            "Prepended to every metric name, including the Node.js runtime metrics.",
          ),
        },
        collectDefaultMetrics: {
          label: t("Node.js runtime metrics"),
          help: t(
            "Event loop lag, heap usage, garbage collection and open handles for the instance being scraped.",
          ),
        },
        collectPlatformMetrics: {
          label: t("Platform metrics"),
          help: t(
            "Servers, backups, orders, payments and IP allocations, counted in the database at scrape time.",
          ),
        },
        durationBucketsMs: {
          label: t("Histogram buckets (ms)"),
          help: t(
            "Comma-separated upper bounds for recorded durations. Leave blank for the default range of 5ms to 5 minutes.",
          ),
        },
        scrapeToken: {
          label: t("Scrape token"),
          help: t(
            "Prometheus sends this as a bearer token. Generate one with `openssl rand -hex 32`.",
          ),
        },
      },
    };
  };
