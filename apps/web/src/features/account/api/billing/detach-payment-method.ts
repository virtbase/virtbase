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

import { TRPCError } from "@trpc/server";
import { getOrCreateStripeCustomer, stripe } from "@virtbase/api/stripe";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";

export async function detatchPaymentMethodAction(id: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  if (!stripe) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  }

  const customer = await getOrCreateStripeCustomer(session.user.id);

  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(id);
    if (paymentMethod.customer !== customer) {
      // Payment method does not belong to the current user's customer
      throw new TRPCError({ code: "FORBIDDEN" });
    }
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({ code: "NOT_FOUND" });
  }

  await stripe.paymentMethods.detach(id);
}
