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

import type { IpReputation, IpReputationProvider } from "@virtbase/ports";
import { categoryNames, REPORTABLE_CATEGORIES } from "./categories";
import type { AbuseIpDbClient } from "./client";
import { createAbuseIpDbClient } from "./client";
import type { AbuseIpDbContext } from "./config";

/**
 * One address, asked about directly.
 *
 * Separate from the sweep because it is synchronous and bidirectional: triage
 * asks about a reported address while an operator is looking at it, and a
 * resolved case may offer to report one of ours back.
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

  async report(input: {
    ip: string;
    categories: string[];
    comment: string;
  }): Promise<{ externalId?: string }> {
    if (!this.ctx.settings.allowReporting) {
      throw new Error(
        "Reporting back to AbuseIPDB is switched off for this integration.",
      );
    }

    const numeric = [
      ...new Set(
        input.categories.flatMap(
          (category) =>
            REPORTABLE_CATEGORIES[
              category as keyof typeof REPORTABLE_CATEGORIES
            ] ?? [],
        ),
      ),
    ];

    if (0 === numeric.length) {
      throw new Error(
        `AbuseIPDB has no category matching ${input.categories.join(", ")}.`,
      );
    }

    const result = await this.client.report({
      ip: input.ip,
      categories: numeric,
      // [!] The comment is published. It must never carry the customer's
      // identity - that is a policy the composing caller enforces, and the cap
      // here only stops the provider rejecting an over-long one.
      comment: input.comment.slice(0, 1024),
    });

    return { externalId: result.ipAddress };
  }
}
