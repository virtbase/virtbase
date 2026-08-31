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

import { captureException } from "@sentry/nextjs";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
} from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { servers, subscriptions, users } from "@virtbase/db/schema";
import { escapedIlike, getDateIntervalFilter } from "@virtbase/db/utils";
import { cacheLife, cacheTag } from "next/cache";
import type { GetSubscriptionsSchema } from "../../lib/subscriptions/validations";
import { verifySession } from "../verify-session";

/**
 * The `server` subject type, spelled out rather than imported.
 *
 * `SERVER_SUBJECT_TYPE` lives in `@virtbase/api`'s subscription domain, and
 * the admin console's read side deliberately does not reach into it for one
 * string — the value is pinned by a check constraint in the schema
 * (`subscriptions_subject_type_known`), which is a stronger guarantee than an
 * import would be.
 */
const SERVER_SUBJECT_TYPE = "server";

/**
 * One row of the operator's subscription list.
 *
 * A projection rather than `select()`, matching the reason the customer-facing
 * router keeps one: a column added to `subscriptions` cannot appear on a
 * screen just because somebody wrote a bare select. Admin sees more than a
 * customer does — the mandate wording version, the cancel reason — but it is
 * still an enumerated more.
 *
 * `payment_methods.external_id` is not here and must never be. It is the
 * credential an off-session charge is made against; support has no use for it,
 * and the one provider identifier support *does* need — the transaction id —
 * lives on `payments` and is shown on the detail page.
 */
const listColumns = {
  id: subscriptions.id,
  status: subscriptions.status,
  subjectType: subscriptions.subjectType,
  subjectId: subscriptions.subjectId,
  intervalMonths: subscriptions.intervalMonths,
  currency: subscriptions.currency,
  currentPeriodStart: subscriptions.currentPeriodStart,
  currentPeriodEnd: subscriptions.currentPeriodEnd,
  autoRenew: subscriptions.autoRenew,
  mandateAcceptedAt: subscriptions.mandateAcceptedAt,
  cancelledAt: subscriptions.cancelledAt,
  createdAt: subscriptions.createdAt,
  // Left-joined: `subject_id` is not a foreign key, so a subscription can
  // outlive the server it paid for. A row with no name left is exactly the
  // kind of row a "why was I still charged" ticket is about, so it must not
  // be hidden by an inner join.
  subjectName: servers.name,
  user: {
    id: users.id,
    name: users.name,
    email: users.email,
    image: users.image,
  },
} as const;

export async function getSubscriptionsList(input: GetSubscriptionsSchema) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("subscriptions");

  await verifySession();

  try {
    const offset = (input.page - 1) * input.perPage;

    const where = and(
      input.q
        ? or(
            // Support arrives with an id pasted out of a ticket as often as
            // with an address, so both go in the one box.
            eq(subscriptions.id, input.q),
            eq(subscriptions.subjectId, input.q),
            escapedIlike(users.email, input.q),
            escapedIlike(users.name, input.q),
            escapedIlike(servers.name, input.q),
          )
        : undefined,
      input.status.length > 0
        ? inArray(subscriptions.status, input.status)
        : undefined,
      input.autoRenew !== null
        ? eq(subscriptions.autoRenew, input.autoRenew)
        : undefined,
      input.mandate === null
        ? undefined
        : input.mandate
          ? isNotNull(subscriptions.mandateAcceptedAt)
          : isNull(subscriptions.mandateAcceptedAt),
      getDateIntervalFilter(
        subscriptions.currentPeriodEnd,
        input.currentPeriodEnd,
      ),
    );

    const orderBy =
      input.sort.length > 0
        ? input.sort.map((item) =>
            item.desc
              ? desc(subscriptions[item.id])
              : asc(subscriptions[item.id]),
          )
        : [asc(subscriptions.currentPeriodEnd)];

    const { data, total } = await db.transaction(
      async (tx) => {
        const data = await tx
          .select(listColumns)
          .from(subscriptions)
          .innerJoin(users, eq(users.id, subscriptions.userId))
          .leftJoin(
            servers,
            and(
              eq(subscriptions.subjectType, SERVER_SUBJECT_TYPE),
              eq(subscriptions.subjectId, servers.id),
            ),
          )
          .limit(input.perPage)
          .offset(offset)
          .where(where)
          // The id is a ULID, so it breaks ties in creation order rather than
          // arbitrarily — which is what keeps pagination stable when a page
          // full of rows shares one period end.
          .orderBy(...orderBy, desc(subscriptions.id));

        const total = await tx
          .select({ value: count() })
          .from(subscriptions)
          .innerJoin(users, eq(users.id, subscriptions.userId))
          .leftJoin(
            servers,
            and(
              eq(subscriptions.subjectType, SERVER_SUBJECT_TYPE),
              eq(subscriptions.subjectId, servers.id),
            ),
          )
          .where(where)
          .then(([row]) => row?.value ?? 0);

        return { data, total };
      },
      { accessMode: "read only", isolationLevel: "read committed" },
    );

    return {
      data: data.map((row) => ({
        ...row,
        // Derived here rather than in the cell, so the table never has to
        // decide what a timestamp means. Whether consent is on file is the
        // question; when it was given is the detail page's business.
        mandateRecorded: row.mandateAcceptedAt !== null,
      })),
      pageCount: Math.ceil(total / input.perPage),
    };
  } catch (error) {
    captureException(error);

    // The same shape an empty result has. A billing screen that throws on a
    // transient database error is a billing screen nobody trusts; the table
    // renders its empty state and Sentry gets the reason.
    return { data: [], pageCount: 0 };
  }
}

/**
 * How many subscriptions sit in each status, for the filter's facet counts.
 *
 * Unfiltered on purpose, the way the abuse queue's counts are: a facet that
 * only counts what the current filter already lets through tells an operator
 * nothing about what they are hiding.
 */
export async function getSubscriptionStatusCounts(): Promise<
  Record<string, number>
> {
  "use cache: private";

  cacheLife({ revalidate: 5, stale: 5, expire: 60 });
  cacheTag("subscriptions");

  await verifySession();

  try {
    const rows = await db
      .select({ status: subscriptions.status, value: count() })
      .from(subscriptions)
      .groupBy(subscriptions.status);

    return Object.fromEntries(rows.map((row) => [row.status, row.value]));
  } catch (error) {
    captureException(error);

    return {};
  }
}

export type GetSubscriptionsListOutput = Awaited<
  ReturnType<typeof getSubscriptionsList>
>;
