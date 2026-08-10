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
  type: "payment.succeeded" | "payment.failed" | "payment.refunded";
  payment: Payment;
  occurredAt: Date;
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
 */
export interface PaymentProvider {
  /** Stable id of the payment method as stored on `transactions.paymentMethod`. */
  readonly method: string;

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  retrievePayment(externalId: string): Promise<Payment>;
  verifyWebhook(request: Request): Promise<PaymentEvent | null>;

  /** Optional: providers that cannot refund programmatically omit this. */
  refund?(input: RefundInput): Promise<void>;
}
