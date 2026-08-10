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
import { handlePaymentFinished, resolveOrderId } from "@virtbase/api/orders";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";
import { AnonpayWebhookSchema } from "@virtbase/integration-anonpay";
import { stripe } from "@virtbase/integration-stripe";
import { safeSecretCompare } from "@virtbase/utils";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (!process.env.ANONPAY_WEBHOOK_SECRET) {
    return new Response("Anonpay is not configured", {
      // Send status 200 to avoid retries
      status: 200,
    });
  }

  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const secret = searchParams.get("secret");
  const expected = process.env.ANONPAY_WEBHOOK_SECRET;
  if (!secret || !safeSecretCompare(secret, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const orderId = await resolveWebhookOrderId(searchParams);
  if (!orderId) {
    return new Response("Missing order ID", {
      status: 400,
    });
  }

  const body = await req.json();
  const { success, data } = await AnonpayWebhookSchema.safeParseAsync(body);
  if (!success) {
    return new Response("Invalid webhook payload", { status: 400 });
  }

  try {
    switch (data.status) {
      case "finished": {
        await handlePaymentFinished({ orderId, data });
        break;
      }
      default:
        // Unhandled status. Pass through with a 200 so Anonpay does not retry.
        break;
    }
  } catch (error) {
    console.error(error);

    Sentry.captureException(error, {
      tags: {
        "anonpay.webhook.error": "true",
      },
    });

    return new Response("Webhook processing failed", { status: 500 });
  }
  return new Response("Webhook received", { status: 200 });
}

/**
 * Finds the order a settlement belongs to.
 *
 * Trades created before Anonpay was decoupled from Stripe call back with a
 * `payment_intent_id` instead of an `order_id`. A customer who has already paid
 * in crypto must still get their server, so that parameter is honoured for one
 * release by resolving the intent to its order.
 *
 * TODO: delete the legacy branch once no Anonpay trade predating the cutover is
 * still open. Trades expire, so this is a short window.
 */
async function resolveWebhookOrderId(
  searchParams: URLSearchParams,
): Promise<string | null> {
  const orderId = searchParams.get("order_id");
  if (orderId) return orderId;

  const paymentIntentId = searchParams.get("payment_intent_id");
  if (!paymentIntentId || !stripe) return null;

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const customer =
    typeof paymentIntent.customer === "object" &&
    paymentIntent.customer !== null
      ? paymentIntent.customer.id
      : paymentIntent.customer;

  if (!customer) return null;

  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customer))
    .limit(1)
    .then(([row]) => row);

  if (!user) return null;

  console.warn(
    "[anonpay] Settling a trade that predates the order-based webhook URL.",
  );

  return resolveOrderId({
    metadata: paymentIntent.metadata as Record<string, string | undefined>,
    userId: user.id,
    amount: paymentIntent.amount,
    planName: paymentIntent.description ?? "Server plan",
  });
}
