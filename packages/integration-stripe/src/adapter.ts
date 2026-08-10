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

import type { IntegrationContext } from "@virtbase/integration-sdk";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  Payment,
  PaymentEvent,
  PaymentProvider,
  PaymentStatus,
} from "@virtbase/ports";
import { PortError } from "@virtbase/ports";
import Stripe from "stripe";

type Secrets = { secretKey: string; webhookSecret: string };

const STATUS: Record<string, PaymentStatus> = {
  requires_payment_method: "pending",
  requires_confirmation: "pending",
  requires_action: "pending",
  processing: "processing",
  requires_capture: "processing",
  succeeded: "succeeded",
  canceled: "cancelled",
};

/**
 * Card and SEPA payments through Stripe.
 *
 * Covers the payment lifecycle only. The checkout UI is built on Stripe
 * Elements and needs customer sessions and saved payment methods, which are not
 * capabilities any other provider could satisfy — the app reaches for the
 * exported client for those rather than pretending they belong on the port.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly method = "stripe";

  private readonly client: Stripe;
  private readonly webhookSecret: string;

  constructor(ctx: IntegrationContext<unknown, Secrets>) {
    this.client = new Stripe(ctx.secrets.secretKey);
    this.webhookSecret = ctx.secrets.webhookSecret;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const intent = await this.client.paymentIntents.create({
      amount: input.total.amount,
      currency: input.total.currency.toLowerCase(),
      description: input.description,
      automatic_payment_methods: { enabled: true },
      // The order id is the only thing the intent needs to carry; the order
      // itself holds what was bought (finding F9).
      metadata: { orderId: input.orderId, ...input.metadata },
    });

    return {
      externalId: intent.id,
      status: STATUS[intent.status] ?? "pending",
      clientSecret: intent.client_secret ?? undefined,
    };
  }

  async retrievePayment(externalId: string): Promise<Payment> {
    const intent = await this.client.paymentIntents.retrieve(externalId);

    return {
      externalId: intent.id,
      orderId: intent.metadata?.orderId ?? null,
      status: STATUS[intent.status] ?? "pending",
      total: {
        amount: intent.amount,
        currency: intent.currency.toUpperCase(),
      },
      method: intent.payment_method_types?.[0] ?? null,
    };
  }

  /**
   * Verifies the signature against the raw body, then normalises the handful of
   * event types that mean something here. Anything else returns `null`.
   */
  async verifyWebhook(request: Request): Promise<PaymentEvent | null> {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      throw new PortError("Stripe webhook has no signature.", {
        port: "payment",
        integrationId: "stripe",
        retryable: false,
      });
    }

    // Signature verification depends on the exact bytes, so the body is read
    // here and nowhere earlier.
    const body = await request.text();

    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(
        body,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      throw new PortError("Invalid Stripe webhook signature.", {
        port: "payment",
        integrationId: "stripe",
        retryable: false,
        cause: error,
      });
    }

    const type =
      event.type === "payment_intent.succeeded"
        ? ("payment.succeeded" as const)
        : event.type === "payment_intent.payment_failed"
          ? ("payment.failed" as const)
          : event.type === "charge.refunded"
            ? ("payment.refunded" as const)
            : null;

    if (!type) return null;

    const object = event.data.object as Stripe.PaymentIntent | Stripe.Charge;
    const externalId =
      "payment_intent" in object && typeof object.payment_intent === "string"
        ? object.payment_intent
        : object.id;

    return {
      id: event.id,
      type,
      occurredAt: new Date(event.created * 1000),
      payment: {
        externalId,
        orderId: object.metadata?.orderId ?? null,
        status: type === "payment.succeeded" ? "succeeded" : "failed",
        total: {
          amount: object.amount,
          currency: object.currency.toUpperCase(),
        },
        method: null,
      },
    };
  }

  async refund(input: { externalId: string; amount?: { amount: number } }) {
    await this.client.refunds.create({
      payment_intent: input.externalId,
      ...(input.amount && { amount: input.amount.amount }),
    });
  }
}
