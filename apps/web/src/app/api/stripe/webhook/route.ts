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
import { handlePaymentIntentSucceeded } from "@virtbase/api/orders";
import {
  handlePaymentMethodAttached,
  handlePaymentMethodDetached,
  handleSetupIntentSucceeded,
} from "@virtbase/api/payment-methods";
import type { Stripe } from "@virtbase/integration-stripe";
import { stripe } from "@virtbase/integration-stripe";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !stripeWebhookSecret) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 500 },
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      stripeWebhookSecret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event);
        break;
      // How a card saved at *checkout* arrives, which is the main way anyone
      // saves one: the customer session is created with `payment_method_save`,
      // so Stripe saves the card off the payment intent and attaches it - no
      // setup intent is created and no setup-intent event is ever sent.
      // Without this the billing page shows "no payment methods" to a customer
      // who has a perfectly good card at Stripe.
      case "payment_method.attached":
        await handlePaymentMethodAttached(event);
        break;
      // A card removed anywhere other than our own UI - the Stripe dashboard,
      // a deleted customer, an issuer withdrawing it. Left unhandled, the row
      // stays live here and renewals keep being charged against a token Stripe
      // has already thrown away.
      case "payment_method.detached":
        await handlePaymentMethodDetached(event);
        break;
      // The other half of "add a payment method" on the account page. The
      // browser confirms the setup intent at Stripe, so this is the only
      // moment this application learns that credential exists.
      case "setup_intent.succeeded":
        await handleSetupIntentSucceeded(event);
        break;
      default:
        // Unhandled event type
        // Passthrough and send status 200
        break;
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        "stripe.webhook.error": "true",
      },
    });

    return NextResponse.json(
      { error: "Event processing failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
