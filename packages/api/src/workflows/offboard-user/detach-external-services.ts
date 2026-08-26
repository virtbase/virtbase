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

import * as Sentry from "@sentry/node";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";
import { unsubscribe } from "@virtbase/email/resend";
import { stripe } from "@virtbase/integration-stripe";

type DetachExternalServicesStepParams = {
  userId: string;
  email: string;
};

/**
 * Removes the customer from the services that hold a copy of them.
 *
 * Every call here is best effort and reported rather than thrown: an
 * unreachable third party must never block an erasure the customer has a right
 * to. What each provider retains afterwards under its own legal obligations is
 * a matter for the privacy policy, not for this step to pretend it controls.
 */
export async function detachExternalServicesStep({
  userId,
  email,
}: DetachExternalServicesStepParams) {
  "use step";

  const customer = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then(([row]) => row);

  let stripeDeleted = false;
  if (stripe && customer?.stripeCustomerId) {
    try {
      // Also detaches any stored payment methods, which is the part the
      // customer would otherwise still see on their card statement's
      // "recurring merchants" list.
      await stripe.customers.del(customer.stripeCustomerId);
      stripeDeleted = true;
    } catch (error) {
      Sentry.captureException(error);
    }
  }

  let unsubscribed = false;
  try {
    await unsubscribe({ email });
    unsubscribed = true;
  } catch (error) {
    Sentry.captureException(error);
  }

  return { stripeDeleted, unsubscribed };
}
