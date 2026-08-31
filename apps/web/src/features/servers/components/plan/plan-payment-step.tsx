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

"use client";

import { ElementsProvider } from "@/features/checkout/components/elements-provider";
import { StripePaymentForm } from "@/features/checkout/components/stripe-payment-form";
import { usePlanContext } from "./plan-context";

/**
 * Stripe Elements, inside the dialog the customer opened.
 *
 * Its own file because loading it loads Stripe.js: the dialog stays free of
 * that so it can be rendered without a network, and this is mounted only once
 * an order exists.
 *
 * It renders no buttons of its own. "Pay now" and the way back to the summary
 * live in the dialog footer, where every other confirmation in this app keeps
 * its actions - which on a phone, where the dialog is a drawer, is also the
 * only way they stay on screen instead of sitting below a Payment Element
 * taller than the viewport. The form keeps ownership of submission and reports
 * its two states up so the footer can disable itself correctly.
 */
export function PlanPaymentStep() {
  const { checkout, setIsConfirmingPayment, setIsPaymentReady } =
    usePlanContext();

  const { clientSecret, customerSessionClientSecret, orderId } = checkout;

  if (!clientSecret || !customerSessionClientSecret) return null;

  return (
    <ElementsProvider
      clientSecret={clientSecret}
      customerSessionClientSecret={customerSessionClientSecret}
    >
      <StripePaymentForm
        orderId={orderId}
        hideActions
        onProcessingChange={setIsConfirmingPayment}
        onReadyChange={setIsPaymentReady}
      />
    </ElementsProvider>
  );
}
