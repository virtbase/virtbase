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
import { parseAsString, useQueryStates } from "nuqs";
import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { useTRPC } from "@/lib/trpc/react";

interface CheckoutStateValue {
  clientSecret: string | null;
  customerSessionClientSecret: string | null;
  createOrder: ReturnType<typeof useCreateOrder>["createOrder"];
  isPending: boolean;
  resetCheckoutSession: () => void;
}

const CheckoutStateContext = createContext<CheckoutStateValue | null>(null);

/**
 * Wraps any subtree that needs to read or trigger the checkout flow.
 *
 * Keeping the mutation + URL state in a single provider means every
 * consumer sees the same `isPending` / `data` — critical when the submit
 * button and the form that submits it live in sibling components (e.g.
 * `PlanSummary` triggers `plan-form` which lives inside `PlanForm`).
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

function useCreateOrder() {
  const trpc = useTRPC();

  const [{ client_secret, customer_session_client_secret }, setCheckoutParams] =
    useQueryStates({
      client_secret: parseAsString,
      customer_session_client_secret: parseAsString,
    });

  const {
    mutate: createOrder,
    isPending,
    reset: resetMutation,
  } = useMutation(
    trpc.checkout.order.mutationOptions({
      onSuccess: (data) => {
        void setCheckoutParams({
          client_secret: data.client_secret,
          customer_session_client_secret: data.customer_session_client_secret,
        });
      },
    }),
  );

  const resetCheckoutSession = useCallback(() => {
    void setCheckoutParams({
      client_secret: null,
      customer_session_client_secret: null,
    });
    resetMutation();
  }, [setCheckoutParams, resetMutation]);

  return useMemo<CheckoutStateValue>(
    () => ({
      clientSecret: client_secret,
      customerSessionClientSecret: customer_session_client_secret,
      createOrder,
      isPending,
      resetCheckoutSession,
    }),
    [
      client_secret,
      customer_session_client_secret,
      createOrder,
      isPending,
      resetCheckoutSession,
    ],
  );
}
