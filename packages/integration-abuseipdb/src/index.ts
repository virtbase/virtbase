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

import { defineIntegration } from "@virtbase/integration-sdk";
import { createAbuseIpDbClient } from "./client";
import { localizeAbuseIpDb } from "./localize";
import { manifest } from "./manifest";
import { AbuseIpDbReputation } from "./reputation";
import { AbuseIpDbSource } from "./source";

/**
 * AbuseIPDB's runtime (ADR 0003); its static half is `./manifest`.
 *
 * It has no health probe: every AbuseIPDB call spends daily quota, and a probe
 * every 30 minutes spent it on nothing (risk C5, INT-8). `onEnable` checks the
 * key with one `/check` call when an operator switches the integration on.
 * After that, a sweep that AbuseIPDB answers with an error that is not
 * retryable, such as a revoked key, rejects `poll`, and the abuse poller
 * (`pollAbuseSources`) records the run as failed.
 */
export default defineIntegration(manifest, {
  provides: {
    abuse: (ctx) => new AbuseIpDbSource(ctx),
    ipReputation: (ctx) => new AbuseIpDbReputation(ctx),
  },
  lifecycle: {
    onEnable: async (ctx) => {
      await createAbuseIpDbClient({
        apiKey: ctx.secrets.apiKey,
        http: ctx.http,
        logger: ctx.logger,
      }).check("127.0.0.1", { maxAgeInDays: 1 });
    },
  },
  localize: localizeAbuseIpDb,
});
