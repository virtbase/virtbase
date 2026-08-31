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
  ChargeOffSessionInput,
  CreatePaymentInput,
  CreatePaymentResult,
  CreateSetupSessionInput,
  OffSessionResult,
  Payment,
  PaymentEvent,
  PaymentProvider,
  PaymentStatus,
} from "@virtbase/ports";
import { PortError } from "@virtbase/ports";
import Stripe from "stripe";
import { getOrCreateStripeCustomer } from "./get-or-create-customer";

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
 * Stripe event types this system understands, mapped onto the normalised ones.
 *
 * Anything absent is deliberately absent: `verifyWebhook` returns `null` for
 * it, and Stripe stops retrying because the route answered 200.
 */
const EVENT_TYPES: Record<string, PaymentEvent["type"]> = {
  "payment_intent.succeeded": "payment.succeeded",
  "payment_intent.payment_failed": "payment.failed",
  "charge.refunded": "payment.refunded",
  "payment_intent.requires_action": "payment.requires_action",
  "payment_method.detached": "payment_method.detached",
  "charge.dispute.created": "payment.disputed",
};

/**
 * The `payments.status` each normalised event implies.
 *
 * `payment.refunded` reports `failed` because the ternary this table replaced
 * did, and nothing reads it — `applyPaymentEvent` derives the stored status
 * from the event type. Correcting it is a change to settlement, not to this.
 *
 * `payment.requires_action` is `pending` and not `failed`: the intent is still
 * live and the money has not moved. `payment.disputed` is `failed` only
 * because `PaymentStatus` has no `disputed` and a disputed charge must stop
 * counting as money in hand; the case itself belongs to a person, who reads
 * the event type rather than this. `payment_method.detached` is `cancelled` —
 * the credential is gone, so nothing on it will ever complete.
 */
const EVENT_PAYMENT_STATUS: Record<PaymentEvent["type"], PaymentStatus> = {
  "payment.succeeded": "succeeded",
  "payment.failed": "failed",
  "payment.refunded": "failed",
  "payment.requires_action": "pending",
  "payment.disputed": "failed",
  "payment_method.detached": "cancelled",
  "payment_method.expired": "cancelled",
};

/**
 * The currency reported for an event that carries no money.
 *
 * A detached payment method has an id and nothing else — Stripe names no
 * amount and no currency — but `Money` has to say something, so this pairs
 * with a zero amount. It is the same default `applyPaymentEvent` falls back to
 * when a provider reports no currency.
 */
const NO_MONEY_CURRENCY = "EUR";

/**
 * Declines that will never come good, however many times the card is tried.
 *
 * Everything else — including anything Stripe adds after this was written — is
 * retryable by default. Getting this wrong in the retryable direction costs
 * one wasted attempt; getting it wrong in the terminal direction cancels a
 * paying customer over a decline that would have cleared on Tuesday.
 */
const TERMINAL_DECLINE_CODES = new Set([
  "card_not_supported",
  "currency_not_supported",
  "fraudulent",
  "invalid_account",
  "lost_card",
  "merchant_blacklist",
  "no_action_taken",
  "pickup_card",
  "restricted_card",
  "revocation_of_all_authorizations",
  "revocation_of_authorization",
  "stolen_card",
  "transaction_not_allowed",
]);

/** Whether charging the same card again could ever work. */
export const isRetryableDecline = (code: string): boolean =>
  !TERMINAL_DECLINE_CODES.has(code);

/**
 * Intent statuses that are an outcome in themselves. A decline is not in here:
 * Stripe reports that by throwing, or by leaving the intent somewhere this
 * table has no answer for.
 */
const OFF_SESSION_STATUS: Record<
  string,
  Exclude<OffSessionResult["status"], "failed">
> = {
  succeeded: "succeeded",
  processing: "processing",
  requires_capture: "processing",
  requires_action: "requires_action",
  requires_confirmation: "requires_action",
};

/**
 * Reads a confirmed off-session intent as an outcome.
 *
 * Split out from the charge so the mapping can be exercised without a Stripe
 * account: it is the part that decides whether a renewal retries, waits for
 * the customer, or gives up.
 */
export const mapOffSessionIntent = (
  intent: Pick<
    Stripe.PaymentIntent,
    "id" | "status" | "client_secret" | "last_payment_error"
  >,
): OffSessionResult => {
  const status = OFF_SESSION_STATUS[intent.status];

  if (status === "requires_action") {
    return {
      status,
      externalId: intent.id,
      clientSecret: intent.client_secret ?? undefined,
    };
  }

  if (status) return { status, externalId: intent.id };

  // `requires_payment_method` and `canceled` after a confirm: the charge did
  // not throw but it did not happen either, which is a decline by another
  // route. Stripe puts the issuer's reason on the intent instead of on an
  // error, so it is read from there.
  const failure = intent.last_payment_error;
  const code = failure?.decline_code ?? failure?.code ?? intent.status;

  return {
    status: "failed",
    externalId: intent.id,
    code,
    retryable: isRetryableDecline(code),
    message:
      failure?.message ?? `Stripe left the payment intent in ${intent.status}.`,
  };
};

/**
 * Stripe types `decline_code` as always present on a card error, but only
 * sends it for an issuer decline — a card error raised for anything else (an
 * expired card, a bad CVC) carries `code` instead.
 */
const declineCodeOf = (error: Stripe.errors.StripeCardError): string =>
  (error.decline_code as string | undefined) ?? error.code ?? "card_declined";

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

    const type = EVENT_TYPES[event.type];
    if (!type) return null;

    const occurredAt = new Date(event.created * 1000);

    // A detached credential is not a payment: Stripe names a payment method
    // and no money at all. Its id goes in `externalId` because that is what
    // the renewal system holds, and the amount is zero rather than invented.
    if (event.type === "payment_method.detached") {
      const paymentMethod = event.data.object as Stripe.PaymentMethod;

      return {
        id: event.id,
        type,
        occurredAt,
        payment: {
          externalId: paymentMethod.id,
          orderId: paymentMethod.metadata?.orderId ?? null,
          status: EVENT_PAYMENT_STATUS[type],
          total: { amount: 0, currency: NO_MONEY_CURRENCY },
          method: paymentMethod.type,
        },
      };
    }

    // A charge, a dispute and an intent all name the intent they belong to,
    // which is what the payment row is keyed on; only the intent itself has to
    // fall back to its own id.
    const object = event.data.object as
      | Stripe.PaymentIntent
      | Stripe.Charge
      | Stripe.Dispute;
    const externalId =
      "payment_intent" in object && typeof object.payment_intent === "string"
        ? object.payment_intent
        : object.id;

    return {
      id: event.id,
      type,
      occurredAt,
      payment: {
        externalId,
        orderId: object.metadata?.orderId ?? null,
        status: EVENT_PAYMENT_STATUS[type],
        total: {
          amount: object.amount,
          currency: object.currency.toUpperCase(),
        },
        method: null,
      },
    };
  }

  /**
   * Charges a card Stripe already holds, with the customer nowhere near it.
   *
   * `off_session: true` is what tells the issuer this is a merchant-initiated
   * renewal rather than a purchase the customer abandoned; without it a card
   * that needs 3-D Secure is simply declined instead of asking. The
   * idempotency key goes in Stripe's request options, not the body, so a lost
   * response replays the same charge rather than billing twice.
   *
   * Only a card decline comes back as `failed`. An unreachable Stripe or a
   * malformed request throws: that is not the customer's card saying no, and
   * treating it as one would spend a dunning attempt on our own outage.
   */
  async chargeOffSession(
    input: ChargeOffSessionInput,
  ): Promise<OffSessionResult> {
    // Resolved through this adapter's own client, not the module-level one:
    // the customer id and the charge have to be minted on the same Stripe
    // account. See `getOrCreateStripeCustomer`.
    const customer = await getOrCreateStripeCustomer(input.userId, this.client);

    try {
      const intent = await this.client.paymentIntents.create(
        {
          amount: input.total.amount,
          currency: input.total.currency.toLowerCase(),
          customer,
          payment_method: input.paymentMethodExternalId,
          off_session: true,
          confirm: true,
          description: input.description,
          // Same contract as `createPayment`: the order id is the only thing
          // the intent carries (finding F9).
          metadata: { orderId: input.orderId },
        },
        { idempotencyKey: input.idempotencyKey },
      );

      return mapOffSessionIntent(intent);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeCardError) {
        const code = declineCodeOf(error);

        return {
          status: "failed",
          // Stripe creates the intent before the issuer refuses it, so there
          // is usually still one to record the attempt against.
          externalId: error.payment_intent?.id,
          code,
          retryable: isRetryableDecline(code),
          message: error.message,
        };
      }

      throw error;
    }
  }

  /**
   * Saves a card for later without charging it.
   *
   * `usage: "off_session"` is the part that matters: it makes the customer
   * authenticate now, while they are present, so the first renewal months from
   * now is not the first time the issuer has been asked to trust us.
   *
   * `returnUrl` goes unused here. Stripe's SetupIntent is confirmed in the
   * browser by Elements, which is handed the return URL client-side; the port
   * carries it for providers that redirect instead.
   */
  async createSetupSession(
    input: CreateSetupSessionInput,
  ): Promise<{ clientSecret?: string; redirectUrl?: string }> {
    // Same account for the customer as for the credential saved against it.
    const customer = await getOrCreateStripeCustomer(input.userId, this.client);

    const setupIntent = await this.client.setupIntents.create({
      customer,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
    });

    return { clientSecret: setupIntent.client_secret ?? undefined };
  }

  /**
   * Detaching is the only thing that guarantees a credential cannot be charged
   * again. Dropping our own row just stops us from picking it.
   */
  async detachPaymentMethod(externalId: string): Promise<void> {
    await this.client.paymentMethods.detach(externalId);
  }

  /**
   * Cancels an intent we have given up waiting on.
   *
   * Called when a renewal's authentication window closes: the intent is still
   * live and still confirmable from the link in the customer's banking app, so
   * retrying without this bills them twice for one month.
   *
   * Idempotent by re-reading. Stripe raises on a cancel it cannot perform, and
   * an intent it has already cancelled itself - it does that to abandoned ones
   * - is the common case here; that is the caller's desired state, so it is
   * not an error. Anything else, `succeeded` above all, is re-raised: the
   * caller must settle such a payment rather than abandon it.
   */
  async cancelPayment(externalId: string): Promise<void> {
    try {
      await this.client.paymentIntents.cancel(externalId);
    } catch (error) {
      if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) {
        throw error;
      }

      const intent = await this.client.paymentIntents.retrieve(externalId);
      if (intent.status !== "canceled") throw error;
    }
  }

  async refund(input: { externalId: string; amount?: { amount: number } }) {
    await this.client.refunds.create({
      payment_intent: input.externalId,
      ...(input.amount && { amount: input.amount.amount }),
    });
  }
}
