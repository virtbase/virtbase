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

import { afterEach } from "bun:test";
import { IntegrationRegistry } from "@virtbase/integration-sdk";
import { describeMetricsSink } from "@virtbase/integration-testing/ports/metrics";
import prometheus from "../index";
import { resetRuntime } from "../runtime";

const silent = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

afterEach(() => {
  resetRuntime();
});

/** The sink as core resolves it: through the registry and the stored settings. */
describeMetricsSink("Prometheus", async () => {
  const sink = await new IntegrationRegistry({
    integrations: [prometheus],
    config: {
      isEnabled: async () => true,
      settings: async () => ({ collectDefaultMetrics: "false" }),
      secrets: async () => ({
        scrapeToken: "prometheus-contract-token-0123456789",
      }),
    },
    logger: silent,
    logSink: silent,
  }).resolve("metrics");
  if (!sink) throw new Error("the registry resolved no metrics sink");
  return { sink };
});
