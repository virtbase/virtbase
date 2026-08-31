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

import { useMutation } from "@tanstack/react-query";
import type { OrderServerPlanInput } from "@virtbase/validators";
import { parseAsString, useQueryStates } from "nuqs";
import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { useTRPC } from "@/lib/trpc/react";

interface CheckoutStateValue {
  /** The order being paid for. Alternative payment methods settle against it. */
  orderId: string | null;
  paymentIntentId: string | null;
  clientSecret: string | null;
  customerSessionClientSecret: string | null;
  createOrder: (input: OrderServerPlanInput) => void;
  isPending: boolean;
  /**
   * Whatever the server refused the order with, for a caller that has a place
   * to show it. Nothing declares `meta.errorMessage` on this mutation, so
   * without a caller reading this a failed order says nothing at all.
   */
  error: Error | null;
  resetCheckoutSession: () => void;
}

const CheckoutStateContext = createContext<CheckoutStateValue | null>(null);

/**
 * Wraps any subtree that needs to read or trigger the checkout flow.
 *
 * Keeping the mutation + URL state in a single provider means every
 * consumer sees the same `isPending` / `data` — critical when the submit
 * button and the form that submits it live in sibling components (e.g. the
 * plan dialog's footer button submits the consent form in its body).
 *
 * Client secrets live in the URL so the user can refresh during checkout
 * without losing their in-progress payment intent. They always move as a
 * pair — both are set together on order creation and both must be cleared
 * together when leaving checkout. `useQueryStates` guarantees both params
 * update in a single URL commit.
 */
export function CheckoutStateProvider({ children }: PropsWithChildren) {
  const value = useCreateOrder();

  return (
    <CheckoutStateContext.Provider value={value}>
      {children}
    </CheckoutStateContext.Provider>
  );
}

export function useCheckoutState() {
  const ctx = useContext(CheckoutStateContext);

  if (!ctx) {
    throw new Error(
      "useCheckoutState must be used within a <CheckoutStateProvider>",
    );
  }

  return ctx;
}

function useCreateOrder(): CheckoutStateValue {
  const trpc = useTRPC();

  const [
    {
      order_id,
      payment_intent_id,
      client_secret,
      customer_session_client_secret,
    },
    setCheckoutParams,
  ] = useQueryStates({
    order_id: parseAsString,
    payment_intent_id: parseAsString,
    client_secret: parseAsString,
    customer_session_client_secret: parseAsString,
  });

  const {
    mutate: createOrder,
    isPending,
    error,
    reset: resetMutation,
  } = useMutation(
    trpc.checkout.order.mutationOptions({
      onSuccess: (data) => {
        void setCheckoutParams({
          order_id: data.order_id,
          payment_intent_id: data.payment_intent_id,
          client_secret: data.client_secret,
          customer_session_client_secret: data.customer_session_client_secret,
        });
      },
    }),
  );

  const resetCheckoutSession = useCallback(() => {
    void setCheckoutParams({
      order_id: null,
      payment_intent_id: null,
      client_secret: null,
      customer_session_client_secret: null,
    });
    resetMutation();
  }, [setCheckoutParams, resetMutation]);

  return useMemo(
    () => ({
      orderId: order_id,
      paymentIntentId: payment_intent_id,
      clientSecret: client_secret,
      customerSessionClientSecret: customer_session_client_secret,
      createOrder,
      isPending,
      // `useMutation` types this as `TRPCClientErrorLike`, the structural
      // subset; what actually arrives is a `TRPCClientError`, which is an
      // `Error`.
      error: error as Error | null,
      resetCheckoutSession,
    }),
    [
      order_id,
      payment_intent_id,
      client_secret,
      customer_session_client_secret,
      createOrder,
      isPending,
      error,
      resetCheckoutSession,
    ],
  );
}
