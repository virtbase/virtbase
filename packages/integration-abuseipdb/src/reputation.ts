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

import { IntegrationError } from "@virtbase/integration-sdk";
import type { IpReputation, IpReputationProvider } from "@virtbase/ports";
import { categoryNames, REPORTABLE_CATEGORIES } from "./categories";
import type { AbuseIpDbClient } from "./client";
import { createAbuseIpDbClient } from "./client";
import type { AbuseIpDbContext } from "./config";

/** {@link REPORTABLE_CATEGORIES}, indexable by any category name. */
const REPORTABLE_BY_NAME: Readonly<Record<string, readonly number[]>> =
  REPORTABLE_CATEGORIES;

/**
 * One address, asked about directly, and the path to publish a report back.
 *
 * Separate from the sweep because it answers about one address at a time and
 * can write to AbuseIPDB. No core code calls `ipReputation` (2026-10-11).
 */
export class AbuseIpDbReputation implements IpReputationProvider {
  readonly id = "abuseipdb";

  private readonly ctx: AbuseIpDbContext;
  private readonly client: AbuseIpDbClient;

  constructor(ctx: AbuseIpDbContext, client?: AbuseIpDbClient) {
    this.ctx = ctx;
    this.client =
      client ??
      createAbuseIpDbClient({
        apiKey: ctx.secrets.apiKey,
        http: ctx.http,
        logger: ctx.logger,
      });
  }

  async check(
    ip: string,
    options: { maxAgeDays?: number } = {},
  ): Promise<IpReputation> {
    const data = await this.client.check(ip, {
      maxAgeInDays: options.maxAgeDays ?? this.ctx.settings.maxAgeInDays,
      verbose: true,
    });

    const numeric = (data.reports ?? []).flatMap((report) => report.categories);

    return {
      ip: data.ipAddress,
      score: data.abuseConfidenceScore,
      categories: categoryNames(numeric),
      totalReports: data.totalReports,
      lastReportedAt: data.lastReportedAt
        ? new Date(data.lastReportedAt)
        : null,
      ...(data.countryCode ? { countryCode: data.countryCode } : {}),
      // A hosting range scores badly for structural reasons. Treating that as
      // evidence about one customer is how an abuse desk starts refusing real
      // signups, so the caller is told what kind of range it is.
      ...(data.usageType ? { usageType: data.usageType } : {}),
    };
  }

  /**
   * Publishes a report against `input.ip` under the AbuseIPDB categories
   * {@link REPORTABLE_CATEGORIES} maps `input.categories` to.
   *
   * A caller must only call it after an operator confirmed the case: a
   * published report affects the whole range's reputation.
   *
   * @throws IntegrationError `abuseipdb.reporting_disabled` while
   * `allowReporting` is off, and `abuseipdb.no_matching_category` when no
   * category maps to an AbuseIPDB one.
   */
  async report(input: {
    ip: string;
    categories: string[];
    comment: string;
  }): Promise<{ externalId?: string }> {
    if (!this.ctx.settings.allowReporting) {
      throw new IntegrationError({
        code: "abuseipdb.reporting_disabled",
        message:
          "Reporting back to AbuseIPDB is switched off for this integration.",
      });
    }

    const numeric = [
      ...new Set(
        input.categories.flatMap((category) =>
          Object.hasOwn(REPORTABLE_CATEGORIES, category)
            ? (REPORTABLE_BY_NAME[category] ?? [])
            : [],
        ),
      ),
    ];

    if (0 === numeric.length) {
      throw new IntegrationError({
        code: "abuseipdb.no_matching_category",
        message: `AbuseIPDB has no category matching ${input.categories.join(", ")}.`,
        params: { categories: input.categories.join(", ") },
      });
    }

    const result = await this.client.report({
      ip: input.ip,
      categories: numeric,
      // [!] AbuseIPDB publishes the comment, so a caller must never put a
      // customer's identity in it: this adapter does not inspect the text,
      // and only cuts it to 1024 characters.
      comment: input.comment.slice(0, 1024),
    });

    return { externalId: result.ipAddress };
  }
}
