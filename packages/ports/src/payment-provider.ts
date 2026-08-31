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

import type { Money } from "./common";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "refunded";

export interface CreatePaymentInput {
  /**
   * Our own order id. Providers must round-trip this so a webhook can be
   * matched to an order without decrypting anything out of provider metadata —
   * the defect F9 describes.
   */
  orderId: string;
  userId: string;
  total: Money;
  /** Human-readable line for the provider's checkout screen. */
  description: string;
  /** Where the provider should send the customer once payment completes. */
  returnUrl: string;
  /** Provider-visible key/value pairs. Never put secrets or order state here. */
  metadata?: Record<string, string>;
}

export interface CreatePaymentResult {
  /** The provider's own id for this payment, stored on the payment row. */
  externalId: string;
  status: PaymentStatus;
  /**
   * Set when the provider needs the browser to finish the flow — a hosted
   * checkout URL (Anonpay) or a client secret for an embedded form (Stripe).
   */
  redirectUrl?: string;
  clientSecret?: string;
}

export interface Payment {
  externalId: string;
  orderId: string | null;
  status: PaymentStatus;
  total: Money;
  /** Provider's own label, e.g. `card`, `sepa_debit`, `xmr`. */
  method: string | null;
}

/**
 * A provider webhook normalised into something the fulfilment workflow can act
 * on. Each adapter is responsible for signature verification before returning
 * one of these.
 */
export interface PaymentEvent {
  /** Provider event id, used to make fulfilment idempotent. */
  id: string;
  /**
   * The normalised event.
   *
   * The first three settle an order and are the only ones fulfilment reads.
   * The rest exist for unattended renewals: nobody is watching a checkout
   * screen, so a provider webhook is the only way to learn that a stored
   * credential now needs the customer, has been detached, or has been
   * disputed. Consumers must switch on this rather than on `payment.status` —
   * `PaymentStatus` has no value for "disputed" or "the credential is gone",
   * so the payment block is a lossy summary for anything past the first three.
   *
   * `payment.requires_action` is not a decline; see {@link OffSessionResult}.
   * `payment_method.detached` and `payment_method.expired` describe a
   * credential rather than a payment, so `payment.externalId` is the payment
   * method id and `payment.total` is zero.
   */
  type:
    | "payment.succeeded"
    | "payment.failed"
    | "payment.refunded"
    | "payment.requires_action"
    | "payment_method.detached"
    | "payment_method.expired"
    | "payment.disputed";
  payment: Payment;
  occurredAt: Date;
}

/**
 * The outcome of a merchant-initiated charge — money taken while the customer
 * is not at the keyboard to answer for it.
 *
 * `requires_action` is deliberately its own status rather than a kind of
 * `failed`. Nothing was declined: the issuer wants the customer to
 * authenticate, and the intent is still live and still chargeable. Folding it
 * into `failed` would spend a dunning attempt on a payment that is going to
 * succeed, retry a charge that must not be retried, and mail the customer that
 * their payment failed instead of the one link that would finish it. A caller
 * that treats this as a decline is wrong in every direction at once.
 */
export type OffSessionResult =
  | { status: "succeeded"; externalId: string }
  | { status: "processing"; externalId: string }
  | { status: "requires_action"; externalId: string; clientSecret?: string }
  | {
      status: "failed";
      /** Absent when the provider rejected the charge before creating one. */
      externalId?: string;
      /**
       * The provider's own decline code, unmapped. Dunning decisions are made
       * from `retryable`; this is kept raw so an operator can look up what the
       * issuer actually said.
       */
      code: string;
      /**
       * Whether charging the same credential again could ever work. Providers
       * default this to `true` for codes they do not recognise: a false retry
       * costs one attempt, a false terminal costs a customer.
       */
      retryable: boolean;
      message: string;
    };

export interface ChargeOffSessionInput {
  /** Our own order id, round-tripped through provider metadata as elsewhere. */
  orderId: string;
  userId: string;
  total: Money;
  /** The stored credential to charge, by the provider's own id for it. */
  paymentMethodExternalId: string;
  /**
   * Makes the charge safe to retry. A renewal is driven by a scheduler that
   * cannot tell "the charge never happened" from "the response was lost", so
   * without this a redelivery bills the customer twice. Callers must derive it
   * from the attempt, not from the clock.
   */
  idempotencyKey: string;
  description: string;
}

export interface CreateSetupSessionInput {
  userId: string;
  /** Where the provider should send the customer once the credential is saved. */
  returnUrl: string;
}

export interface RefundInput {
  externalId: string;
  /** Omit for a full refund. */
  amount?: Money;
  reason?: string;
}

/**
 * A way to take money. Implemented by Stripe, Anonpay and — once WS5 lands —
 * the internal credit balance.
 *
 * `verifyWebhook` returns `null` for events the provider sends that this
 * system does not care about, so route handlers stay a one-liner.
 *
 * Everything a customer-present checkout needs is required. The three
 * off-session methods are optional because they are not a property every
 * provider can have: Anonpay settles a trade the customer initiates and has
 * nothing to store, and the internal credit balance has no credential to
 * charge. A caller must therefore check for the method rather than assume it,
 * and treat its absence as "this provider cannot renew" instead of failing the
 * renewal.
 */
export interface PaymentProvider {
  /** Stable id of the payment method as stored on `payments.provider`. */
  readonly method: string;

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  retrievePayment(externalId: string): Promise<Payment>;
  verifyWebhook(request: Request): Promise<PaymentEvent | null>;

  /** Optional: providers that cannot refund programmatically omit this. */
  refund?(input: RefundInput): Promise<void>;

  /**
   * Charges a stored credential with nobody watching.
   *
   * Optional: only a provider that can hold a credential on our behalf can do
   * this at all.
   */
  chargeOffSession?(input: ChargeOffSessionInput): Promise<OffSessionResult>;

  /**
   * Collects and authenticates a credential without taking money, so the first
   * unattended charge is not also the first time the issuer has seen us. A
   * card saved during a normal checkout may still be refused off-session; this
   * is what gets the customer through the authentication while they are there
   * to do it.
   */
  createSetupSession?(
    input: CreateSetupSessionInput,
  ): Promise<{ clientSecret?: string; redirectUrl?: string }>;

  /**
   * Detaches a stored credential at the provider.
   *
   * Dropping our own row only stops us from choosing it. Detaching is the only
   * thing that guarantees the credential can never be charged again, which is
   * what a customer removing a card — and what deleting their account — has to
   * mean.
   */
  detachPaymentMethod?(externalId: string): Promise<void>;

  /**
   * Withdraws a payment the provider is still holding open.
   *
   * The case this exists for is a charge parked waiting on the customer to
   * authenticate. Giving up on one and retrying without withdrawing it leaves
   * two live payments for one period: the retry mints a new one, and the
   * customer taps the original authentication link days later and is billed
   * twice. Cancelling is the only thing that makes the abandonment real at the
   * provider rather than only in our own table.
   *
   * Optional, like the off-session methods and for the same reason: only a
   * provider that holds a payment open across a customer's absence has
   * anything to cancel. A caller must check for the method rather than assume
   * it, and must treat a failure to cancel as a reason **not** to retry — a
   * second charge is worse than a period collected a run later.
   *
   * Implementations must be idempotent: cancelling a payment the provider has
   * already cancelled is a no-op, not an error. Cancelling one that has since
   * succeeded must throw, so the caller settles it instead of abandoning it.
   */
  cancelPayment?(externalId: string): Promise<void>;
}
