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
} from "@virtbase/ports";
import { PortError } from "@virtbase/ports";
import { APP_NAME, SUPPORT_EMAIL, safeSecretCompare } from "@virtbase/utils";
import type { AnonpayClient } from "./client";
import { ANONPAY_MIN_AMOUNT } from "./constants";
import { AnonpayWebhookSchema } from "./types";

type Settings = { tickerTo: string; networkTo: string; address: string };
type Secrets = { webhookSecret: string };

/**
 * Cryptocurrency payments through Trocador's Anonpay.
 *
 * Anonpay used to run on Stripe's rails — the trade settled a Stripe
 * PaymentIntent, and the crypto payment was reported back into Stripe as the
 * ledger of record. It now settles directly against an order, which is what
 * makes it a payment provider in its own right rather than a payment method
 * layered on another one.
 */
export class AnonpayPaymentProvider implements PaymentProvider {
  readonly method = "anonpay";

  private readonly client: AnonpayClient;
  private readonly ctx: IntegrationContext<Settings, Secrets>;

  constructor(
    client: AnonpayClient,
    ctx: IntegrationContext<Settings, Secrets>,
  ) {
    this.client = client;
    this.ctx = ctx;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (input.total.amount < ANONPAY_MIN_AMOUNT) {
      throw new PortError(
        `Anonpay requires at least ${ANONPAY_MIN_AMOUNT} cents.`,
        { port: "payment", integrationId: "anonpay", retryable: false },
      );
    }

    const { tickerTo, networkTo, address } = this.ctx.settings;

    // The order id travels on the webhook URL: Anonpay echoes nothing back, so
    // this is the only way the settlement finds its way home.
    const webhook = new URL(input.returnUrl);
    webhook.searchParams.set("secret", this.ctx.secrets.webhookSecret);
    webhook.searchParams.set("order_id", input.orderId);

    const response = await this.client.create({
      ticker_to: tickerTo,
      network_to: networkTo,
      address,
      description: input.description,
      amount: (input.total.amount / 100).toFixed(2),
      fiat_equiv: input.total.currency,
      direct: false,
      email: SUPPORT_EMAIL,
      donation: false,
      remove_direct_pay: true,
      simple_mode: true,
      bgcolor: "0a0a0aff",
      buttonbgcolor: "ffffff",
      textcolor: "000000",
      name: APP_NAME,
      webhook: webhook.toString(),
    });

    return {
      // Anonpay assigns its trade id at settlement, not at creation.
      externalId: input.orderId,
      status: "pending",
      redirectUrl: response.url,
    };
  }

  async retrievePayment(): Promise<Payment> {
    throw new PortError("Anonpay cannot look up a payment after the fact.", {
      port: "payment",
      integrationId: "anonpay",
      retryable: false,
    });
  }

  /**
   * Anonpay authenticates with a shared secret on the query string rather than
   * a signature over the body, and sends no event id — the trade id is the only
   * thing that identifies a settlement, so it doubles as the idempotency key.
   */
  async verifyWebhook(request: Request): Promise<PaymentEvent | null> {
    const url = new URL(request.url);

    const secret = url.searchParams.get("secret");
    if (!secret || !safeSecretCompare(secret, this.ctx.secrets.webhookSecret)) {
      throw new PortError("Invalid Anonpay webhook secret.", {
        port: "payment",
        integrationId: "anonpay",
        retryable: false,
      });
    }

    const orderId = url.searchParams.get("order_id");
    if (!orderId) {
      throw new PortError("Anonpay webhook carries no order id.", {
        port: "payment",
        integrationId: "anonpay",
        retryable: false,
      });
    }

    const parsed = AnonpayWebhookSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new PortError("Invalid Anonpay webhook payload.", {
        port: "payment",
        integrationId: "anonpay",
        retryable: false,
      });
    }

    const data = parsed.data;

    // Everything except a finished trade is progress reporting, not an outcome.
    if (data.status !== "finished") return null;

    return {
      id: data.trade_id,
      type: "payment.succeeded",
      occurredAt: new Date(data.date),
      payment: {
        externalId: data.trade_id,
        orderId,
        status: "succeeded",
        total: {
          amount: Math.round(data.details.fiat_amount * 100),
          currency: data.details.fiat_equiv.toUpperCase(),
        },
        method: this.method,
      },
    };
  }
}
