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

import { zodResolver } from "@hookform/resolvers/zod";
import type { ExtendOrUpgradeServerPlanInput } from "@virtbase/validators";
import { OrderExtendServerPlanInputSchema } from "@virtbase/validators";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { UseFormReturn } from "react-hook-form";
import { FormProvider, useForm } from "react-hook-form";
import type { PlanSpecsShape } from "./plan-specs";

/**
 * A plan as this surface reads one.
 *
 * Narrower than what `servers.plan.get` returns on purpose: the catalogue, the
 * dialog and the summary need a name, four specs and three numbers, and every
 * one of them can then be rendered from a literal in a test rather than from a
 * hand-built copy of the router's output.
 */
export interface Plan extends PlanSpecsShape {
  id: string;
  name: string;
  /** The catalog price, before any renewal discount. */
  price: number;
  current: boolean;
  available: boolean;
  /**
   * What a renewal costs. On the current row this is the price already locked
   * in on `server_plan_prices`; on every other row it is the freshly evaluated
   * catalog price.
   */
  renewal_price?: number;
  renewal_discount?: {
    type: "PERCENTAGE" | "FIXED";
    amount: number;
  } | null;
  /** Pro-rata cents due today to move onto this plan. Null on the current row. */
  upgrade_price?: number | null;
}

/**
 * What the customer pressed.
 *
 * The order type is a fact about the button that was pressed - "Extend" on the
 * row of the plan the server is on, "Upgrade" on any other row - and never
 * about anything the list happens to be showing. Holding it here is what makes
 * {@link PlanContextValue.submit} unable to send a stale one: there is no
 * second copy of it in form state to fall out of date.
 */
export interface PlanAction {
  mode: "extend" | "upgrade";
  planId: string;
}

/** The one place an action becomes an order type. */
const ORDER_TYPE = {
  extend: "extend_server",
  upgrade: "upgrade_server",
} as const;

/**
 * The two consent boxes, and nothing else.
 *
 * Everything else the order needs - which plan, which server, which type - is
 * read off the action at submit time rather than kept in form state, so the
 * form cannot describe a different purchase from the one the dialog is showing.
 * Picked off the real input schema rather than restated, so the refinements
 * that make both boxes mandatory are the ones the server enforces.
 */
const PlanConsentSchema = OrderExtendServerPlanInputSchema.pick({
  terms: true,
  waiver: true,
});

export interface PlanConsent {
  terms: boolean;
  waiver: boolean;
}

const NO_CONSENT: PlanConsent = { terms: false, waiver: false };

/**
 * The checkout session, handed in rather than reached for.
 *
 * Keeps this provider free of the query client, the router and the URL, which
 * is what lets the whole flow - list, dialog, submit - be rendered in a test
 * with nothing but a translator behind it.
 */
export interface PlanCheckoutState {
  orderId: string | null;
  clientSecret: string | null;
  customerSessionClientSecret: string | null;
  isPending: boolean;
  error: Error | null;
  createOrder: (input: ExtendOrUpgradeServerPlanInput) => void;
  resetCheckoutSession: () => void;
}

interface PlanContextValue {
  plans: Plan[];
  currentPlan: Plan | null;
  isPending: boolean;
  /** What the dialog is open for. Null when nothing has been pressed yet. */
  action: PlanAction | null;
  /** The plan {@link action} names, resolved against the catalogue. */
  actionPlan: Plan | null;
  isOpen: boolean;
  openAction: (action: PlanAction) => void;
  close: () => void;
  /** True while an order exists that nobody has paid for yet. */
  hasOrder: boolean;
  /** The plan that order was created for, when this session still knows it. */
  orderedPlan: Plan | null;
  resumeOrder: () => void;
  discardOrder: () => void;
  /** Leave the payment step and go back to the summary, keeping the dialog. */
  backToSummary: () => void;
  /** True once the order is created and Stripe is collecting the money. */
  isPaymentStep: boolean;
  form: UseFormReturn<PlanConsent>;
  submit: (event?: React.BaseSyntheticEvent) => void;
  checkout: PlanCheckoutState;
  /**
   * True while `stripe.confirmPayment` is in flight. The dialog refuses to
   * close then: tearing the Elements tree down mid-confirmation loses the
   * customer's payment without telling them what happened.
   */
  isConfirmingPayment: boolean;
  setIsConfirmingPayment: (isConfirming: boolean) => void;
  /**
   * True once Stripe.js and Elements have loaded. The dialog footer owns the
   * "Pay now" button, so it has to know when pressing it would do nothing.
   */
  isPaymentReady: boolean;
  setIsPaymentReady: (isReady: boolean) => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

/**
 * The state behind "change or extend", and none of the data fetching.
 *
 * Two things live here and nowhere else: which action the dialog is open for,
 * and whether an order has been created and left unpaid. The second is why
 * dismissing the dialog mid-flight cannot go silent - see
 * {@link PlanContextValue.hasOrder}. There is no selection: a row is pressed,
 * not picked.
 */
export function PlanProvider({
  children,
  serverId,
  plans,
  currentPlan,
  isPending,
  checkout,
}: React.PropsWithChildren<{
  serverId: string;
  plans: Plan[];
  currentPlan: Plan | null;
  isPending: boolean;
  checkout: PlanCheckoutState;
}>) {
  const form = useForm<PlanConsent>({
    resolver: zodResolver(PlanConsentSchema),
    defaultValues: NO_CONSENT,
  });

  const [action, setAction] = useState<PlanAction | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [isPaymentReady, setIsPaymentReady] = useState(false);

  /**
   * The action an order was created for.
   *
   * Written at submit time rather than derived from the URL: the client
   * secrets survive a reload but say nothing about which plan they belong to,
   * and an order that cannot be matched to an action is one this session must
   * not offer to resume against a different plan.
   */
  const [orderedAction, setOrderedAction] = useState<PlanAction | null>(null);

  const { clientSecret, customerSessionClientSecret, resetCheckoutSession } =
    checkout;

  const hasOrder = Boolean(clientSecret && customerSessionClientSecret);

  const actionPlan = useMemo(
    () =>
      action ? (plans.find((plan) => plan.id === action.planId) ?? null) : null,
    [plans, action],
  );

  const orderedPlan = useMemo(
    () =>
      orderedAction
        ? (plans.find((plan) => plan.id === orderedAction.planId) ?? null)
        : null,
    [plans, orderedAction],
  );

  const openAction = useCallback(
    (next: PlanAction) => {
      // A session that was opened for something else must not survive into
      // this one: its payment intent is priced for the previous plan, and the
      // dialog would drop the customer straight onto it.
      const isSameOrder =
        orderedAction?.mode === next.mode &&
        orderedAction?.planId === next.planId;

      if (hasOrder && !isSameOrder) {
        resetCheckoutSession();
        setOrderedAction(null);
      }

      // Consent is given for one order. Re-open for another and it is asked
      // for again.
      form.reset(NO_CONSENT);
      setAction(next);
      setIsOpen(true);
    },
    [form, hasOrder, orderedAction, resetCheckoutSession],
  );

  const close = useCallback(() => {
    if (isConfirmingPayment) return;
    setIsOpen(false);
  }, [isConfirmingPayment]);

  const resumeOrder = useCallback(() => {
    setIsOpen(true);
  }, []);

  const discardOrder = useCallback(() => {
    resetCheckoutSession();
    setOrderedAction(null);
    setIsOpen(false);
  }, [resetCheckoutSession]);

  const backToSummary = useCallback(() => {
    resetCheckoutSession();
    setOrderedAction(null);
  }, [resetCheckoutSession]);

  const { createOrder } = checkout;
  const { handleSubmit } = form;

  const submit = useMemo(
    () =>
      handleSubmit((consent) => {
        if (!action) return;

        const order = {
          server_id: serverId,
          server_plan_id: action.planId,
          terms: consent.terms,
          waiver: consent.waiver,
        };

        setOrderedAction(action);
        createOrder(
          "extend" === action.mode
            ? { ...order, type: ORDER_TYPE.extend }
            : { ...order, type: ORDER_TYPE.upgrade },
        );
      }),
    [action, createOrder, handleSubmit, serverId],
  );

  const value = useMemo<PlanContextValue>(
    () => ({
      plans,
      currentPlan,
      isPending,
      action,
      actionPlan,
      isOpen,
      openAction,
      close,
      hasOrder,
      orderedPlan,
      resumeOrder,
      discardOrder,
      backToSummary,
      isPaymentStep: hasOrder,
      form,
      submit,
      checkout,
      isConfirmingPayment,
      setIsConfirmingPayment,
      isPaymentReady,
      setIsPaymentReady,
    }),
    [
      plans,
      currentPlan,
      isPending,
      action,
      actionPlan,
      isOpen,
      openAction,
      close,
      hasOrder,
      orderedPlan,
      resumeOrder,
      discardOrder,
      backToSummary,
      form,
      submit,
      checkout,
      isConfirmingPayment,
      isPaymentReady,
    ],
  );

  return (
    <PlanContext.Provider value={value}>
      <FormProvider {...form}>{children}</FormProvider>
    </PlanContext.Provider>
  );
}

export const usePlanContext = () => {
  const context = useContext(PlanContext);

  if (!context) {
    throw new Error("usePlanContext must be used within a PlanProvider");
  }

  return context;
};
