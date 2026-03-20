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

import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";
import { stripe } from "./client";

export const getOrCreateStripeCustomer = async (userId: string) => {
  const user = await db.transaction(
    async (tx) => {
      return tx
        .select({
          id: users.id,
          stripeCustomerId: users.stripeCustomerId,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(([res]) => res);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!user) {
    throw new Error("Failed to get the Stripe customer for non-existent user.");
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  return createStripeCustomer(userId);
};

const createStripeCustomer = async (userId: string) => {
  const created = await db.transaction(
    async (tx) => {
      if (!stripe) {
        throw new Error(
          "STRIPE_SECRET_KEY is not set in the .env. Stripe customer creation failed.",
        );
      }

      const user = await tx
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          locale: users.locale,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(([res]) => res);

      if (!user) {
        throw new Error(
          "Failed to create a Stripe customer for non-existent user.",
        );
      }

      const customer = await stripe.customers.create({
        email: user.email,
        ...(user.name && {
          individual_name: user.name,
        }),
        ...(user.locale && {
          preferred_locales: [user.locale],
        }),
        metadata: {
          userId: user.id,
        },
      });

      await tx
        .update(users)
        .set({
          stripeCustomerId: customer.id,
        })
        .where(eq(users.id, user.id));

      return customer;
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  return created.id;
};
