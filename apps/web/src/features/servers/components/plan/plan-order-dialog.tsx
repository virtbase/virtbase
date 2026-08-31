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

import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { Button } from "@virtbase/ui/button";
import {
  LucideArrowLeft,
  LucideLock,
  LucideTriangleAlert,
} from "@virtbase/ui/icons";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { formatBytes } from "@virtbase/utils";
import { useExtracted, useFormatter } from "next-intl";
import type React from "react";
import { CheckoutWaivers } from "@/features/checkout/components/checkout-waivers";
import { PAYMENT_FORM_ID } from "@/features/checkout/constants";
import { getMutationErrorDetail } from "@/lib/trpc/query-client";
import { usePlanContext } from "./plan-context";
import { getPlanCharge, PlanSummary } from "./plan-summary";

/** The consent form lives in the body; the confirm button lives in the footer. */
const PLAN_ORDER_FORM_ID = "plan-order-form";

/**
 * One dialog, two modes, and the only place an order is placed.
 *
 * Extending and upgrading ask the customer the same three questions in the
 * same order - what am I buying, what leaves my account today, do I accept the
 * terms - so they are one dialog with two summaries rather than two dialogs
 * that drift apart. What differs is the money: an extension buys another month
 * at the renewal price, an upgrade buys the rest of the current term on a
 * bigger plan and is charged pro rata.
 *
 * Once the order exists the body becomes the payment step. It happens in here
 * rather than back on the page because the customer never left this dialog -
 * and because dismissing it then is a decision with a consequence, which the
 * card behind it spells out instead of quietly forgetting the order.
 *
 * Both steps keep their two actions in the footer - dismiss, then the thing
 * the customer came for - so the dialog does not rearrange itself halfway
 * through. On the payment step the submit is wired to the Elements form by
 * {@link PAYMENT_FORM_ID} rather than living inside it, which is also what
 * keeps it on screen in the drawer instead of below a Payment Element taller
 * than the phone.
 *
 * `paymentStep` arrives as a node rather than being imported: Stripe's
 * Elements loads a script the moment its module is evaluated, and keeping that
 * out of this file is what lets the whole flow be rendered in a test.
 */
export function PlanOrderDialog({
  paymentStep,
}: {
  paymentStep?: React.ReactNode;
}) {
  const t = useExtracted();
  const format = useFormatter();

  const {
    action,
    actionPlan,
    currentPlan,
    isOpen,
    close,
    isPaymentStep,
    form,
    submit,
    checkout,
    backToSummary,
    isConfirmingPayment,
    isPaymentReady,
  } = usePlanContext();

  const mode = action?.mode ?? "upgrade";
  const isExtend = "extend" === mode;

  const money = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: "EUR" });

  const charge = actionPlan ? getPlanCharge({ mode, plan: actionPlan }) : null;

  /**
   * Why the confirm button is dead, in a sentence.
   *
   * A greyed-out button with no explanation is the worst state this dialog can
   * be in: the customer came here to spend money and is being refused without
   * being told what to do instead.
   */
  const disabledReason = (() => {
    if (!actionPlan) return null;

    if (currentPlan && actionPlan.storage < currentPlan.storage) {
      return t(
        "This plan has less storage than yours. Pick one with at least {size}.",
        {
          size: formatBytes(currentPlan.storage * 1024 * 1024 * 1024, {
            formatter: format,
          }),
        },
      );
    }

    if (
      currentPlan &&
      currentPlan.id !== actionPlan.id &&
      !actionPlan.available
    ) {
      return t(
        "{name} is sold out right now. Try again later or pick a different plan.",
        { name: actionPlan.name },
      );
    }

    if (!currentPlan && !actionPlan.available) {
      return t("This plan is sold out. Pick a different plan.");
    }

    // Pro-rata is zero once the term has lapsed, so there is nothing
    // meaningful to charge for the bigger plan yet.
    if (!isExtend && charge?.dueToday === 0) {
      return t(
        "Your current term has expired. Renew your server first, then upgrade.",
      );
    }

    return null;
  })();

  const orderError = checkout.error
    ? (getMutationErrorDetail(checkout.error) ?? t("Try again in a moment."))
    : null;

  const isSubmitDisabled =
    checkout.isPending || !actionPlan || disabledReason !== null;

  const title = isPaymentStep
    ? t("Complete your payment")
    : isExtend
      ? t("Extend {name}", { name: actionPlan?.name ?? "" })
      : t("Upgrade to {name}", { name: actionPlan?.name ?? "" });

  const confirmLabel = isExtend
    ? t("Extend for {price}", { price: money(charge?.dueToday ?? 0) })
    : t("Upgrade for {price}", { price: money(charge?.dueToday ?? 0) });

  return (
    <ResponsiveDialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={title}
      // The payment step is the tall one. Letting the body take the height
      // that is left and scroll inside it is what keeps the footer - and with
      // it "Pay now" - pinned on a phone, where the dialog is a drawer.
      containerClassName={isPaymentStep ? "min-h-0 flex-1" : undefined}
      description={
        isPaymentStep
          ? t("Pay for the order you just placed.")
          : isExtend
            ? t("Extend your plan by one month.")
            : t("Move this server onto a bigger plan.")
      }
      footer={
        isPaymentStep ? (
          <>
            {/*
             * The way back is an alternative to paying, so it takes the
             * dismiss slot. It locks while a confirmation is in flight:
             * dropping the session then loses a payment already on its way.
             */}
            <Button
              type="button"
              variant="outline"
              onClick={backToSummary}
              disabled={isConfirmingPayment}
            >
              <LucideArrowLeft aria-hidden="true" />
              {t("Change plan")}
            </Button>
            <Button
              type="submit"
              form={PAYMENT_FORM_ID}
              disabled={isConfirmingPayment || !isPaymentReady}
              aria-busy={isConfirmingPayment}
              data-testid="confirm-plan-payment"
            >
              {isConfirmingPayment ? (
                <Spinner />
              ) : (
                <LucideLock aria-hidden="true" strokeWidth={1.75} />
              )}
              {isConfirmingPayment ? t("Processing payment…") : t("Pay now")}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={checkout.isPending}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              form={PLAN_ORDER_FORM_ID}
              disabled={isSubmitDisabled}
              aria-busy={checkout.isPending}
              data-testid="confirm-plan-order"
            >
              {checkout.isPending ? (
                <Spinner />
              ) : (
                <LucideLock aria-hidden="true" strokeWidth={1.75} />
              )}
              {checkout.isPending ? t("Preparing checkout…") : confirmLabel}
            </Button>
          </>
        )
      }
    >
      {isPaymentStep ? (
        paymentStep
      ) : actionPlan ? (
        <form
          id={PLAN_ORDER_FORM_ID}
          onSubmit={submit}
          className="flex flex-col gap-5"
        >
          <PlanSummary
            mode={mode}
            plan={actionPlan}
            currentPlan={currentPlan}
          />

          {disabledReason && (
            <Alert variant="warning">
              <LucideTriangleAlert aria-hidden="true" />
              <AlertDescription>{disabledReason}</AlertDescription>
            </Alert>
          )}

          {orderError && (
            <Alert variant="destructive" data-testid="plan-order-error">
              <LucideTriangleAlert aria-hidden="true" />
              <AlertTitle>{t("The order could not be started")}</AlertTitle>
              <AlertDescription>{orderError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3 border-t pt-4">
            <CheckoutWaivers control={form.control} external />
          </div>
        </form>
      ) : null}
    </ResponsiveDialog>
  );
}
