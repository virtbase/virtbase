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
import {
  AnonpayWebhookSchema,
  handlePaymentFinished,
} from "@virtbase/api/anonpay";
import { ANONPAY_STRIPE_METHOD_ID } from "@virtbase/api/anonpay/constants";
import { stripe } from "@virtbase/api/stripe";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (
    !stripe ||
    !ANONPAY_STRIPE_METHOD_ID ||
    !process.env.ANONPAY_WEBHOOK_SECRET
  ) {
    return new Response("Stripe or Anonpay is not configured", {
      // Send status 200 to avoid retries
      status: 200,
    });
  }

  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const secret = searchParams.get("secret");
  if (!secret || secret !== process.env.ANONPAY_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const paymentIntentId = searchParams.get("payment_intent_id");
  if (!paymentIntentId) {
    return new Response("Missing payment intent ID", {
      status: 400,
    });
  }

  const body = await req.json();
  const { success, data } = await AnonpayWebhookSchema.safeParseAsync(body);
  if (!success) {
    return new Response("Invalid webhook payload", { status: 400 });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    const customer =
      typeof paymentIntent.customer === "object" &&
      paymentIntent.customer !== null
        ? paymentIntent.customer.id
        : paymentIntent.customer;

    if (!customer) {
      return new Response("Missing customer in payment intent", {
        status: 400,
      });
    }

    if (data.status === "finished" || data.status === "failed") {
      // Report the payment status to Stripe

      console.log("data", data);
      console.log("creating payment method");

      // Create an instance of the custom payment method
      const paymentMethod = await stripe.paymentMethods.create(
        {
          type: "custom",
          custom: {
            type: ANONPAY_STRIPE_METHOD_ID,
          },
        },
        { idempotencyKey: `create-payment-method-${data.trade_id}` },
      );

      const statusDateSeconds = new Date(data.date).getTime() / 1000;

      console.log("status date seconds", statusDateSeconds);
      console.log("reporting payment");

      await stripe.paymentRecords.reportPayment(
        {
          description: paymentIntent.description || undefined,
          amount_requested: {
            value: Math.round(data.details.fiat_amount * 100),
            currency: data.details.fiat_equiv.toLowerCase(),
          },
          payment_method_details: { payment_method: paymentMethod.id },
          customer_details: { customer },
          processor_details: {
            type: "custom",
            custom: { payment_reference: data.trade_id },
          },
          initiated_at: statusDateSeconds,
          customer_presence: "on_session",
          outcome: data.status === "finished" ? "guaranteed" : "failed",
          ...(data.status === "finished"
            ? { guaranteed: { guaranteed_at: statusDateSeconds } }
            : { failed: { failed_at: statusDateSeconds } }),
        },
        { idempotencyKey: `report-payment-${data.trade_id}` },
      );
    }

    switch (data.status) {
      case "finished": {
        console.log("handling payment finished");
        await handlePaymentFinished({
          paymentIntent,
          data,
        });
        break;
      }
      default:
        // Unhandled event type
        // Passthrough and send status 200
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
