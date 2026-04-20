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

import * as Sentry from "@sentry/nextjs";
import { getOrCreateStripeCustomer, stripe } from "@virtbase/api/stripe";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth/server";

export const getPaymentMethodList = cache(async () => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || !stripe) {
      return [];
    }

    const customer = await getOrCreateStripeCustomer(session.user.id);
    const paymentMethods = await stripe.customers.listPaymentMethods(customer, {
      limit: 50,
    });

    return paymentMethods.data;
  } catch (error) {
    Sentry.captureException(error);

    return [];
  }
});
