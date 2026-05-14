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

"use server";

import type { Stripe } from "@virtbase/api/stripe";
import { stripe } from "@virtbase/api/stripe";
import type { Session } from "@virtbase/auth";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  accounts as accountsTable,
  sessions as sessionsTable,
} from "@virtbase/db/schema";
import { CreateUserExportInputSchema } from "@virtbase/validators/admin";
import { headers } from "next/headers";
import { hasLocale } from "use-intl";
import { defaultLocale, locales } from "@/i18n/config";
import { auth } from "@/lib/auth/server";
import { actionClient } from "../../lib/action-client";
import { generateInventoryPdf } from "./generator/generate-inventory-pdf";

export const createUserExportAction = actionClient
  .inputSchema(CreateUserExportInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { user: requester } = ctx;
    const { user_id: userId } = parsedInput;

    const [user, sessions, accounts] = await Promise.all([
      auth.api.getUser({
        query: { id: userId },
        headers: await headers(),
      }) as Promise<Session["user"]>,
      db
        .select({
          id: sessionsTable.id,
          ipAddress: sessionsTable.ipAddress,
          userAgent: sessionsTable.userAgent,
          createdAt: sessionsTable.createdAt,
        })
        .from(sessionsTable)
        .where(eq(sessionsTable.userId, userId))
        .orderBy(sessionsTable.createdAt),
      db
        .select({
          id: accountsTable.id,
          accountId: accountsTable.accountId,
          providerId: accountsTable.providerId,
          createdAt: accountsTable.createdAt,
          updatedAt: accountsTable.updatedAt,
          scope: accountsTable.scope,
        })
        .from(accountsTable)
        .where(eq(accountsTable.userId, userId))
        .orderBy(accountsTable.createdAt),
    ]);

    const userWithStripeCustomerId = user as unknown as {
      stripeCustomerId: string;
    };
    let charges: Stripe.Charge[] = [];
    if (stripe && userWithStripeCustomerId.stripeCustomerId) {
      try {
        charges = await stripe.charges
          .list({
            customer: userWithStripeCustomerId.stripeCustomerId,
            limit: 100,
          })
          .then((res) => res.data);
      } catch {
        charges = [];
      }
    }

    const locale = hasLocale(locales, requester.locale)
      ? requester.locale
      : defaultLocale;

    const blob = await generateInventoryPdf({
      user,
      sessions,
      accounts,
      charges,
      locale,
    });

    return blob;
  });
