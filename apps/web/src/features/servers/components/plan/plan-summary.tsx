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

import { Alert, AlertDescription } from "@virtbase/ui/alert";
import { Button } from "@virtbase/ui/button";
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideCpu,
  LucideHardDrive,
  LucideLock,
  LucideMemoryStick,
  LucideNetwork,
  LucideTriangleAlert,
} from "@virtbase/ui/icons";
import { Separator } from "@virtbase/ui/separator";
import { Skeleton } from "@virtbase/ui/skeleton";
import { Spinner } from "@virtbase/ui/spinner";
import { formatBits, formatBytes } from "@virtbase/utils";
import { useExtracted, useFormatter } from "next-intl";
import { useCheckoutState } from "@/features/checkout/hooks/use-checkout-state";
import { usePlanContext } from "./plan-context";

export function PlanSummary() {
  const t = useExtracted();
  const format = useFormatter();

  const {
    selectedPlan,
    currentPlan,
    isPending: isPlansPending,
    isConfirmingPayment,
  } = usePlanContext();

  const {
    isPending: isCheckoutPending,
    clientSecret,
    customerSessionClientSecret,
    resetCheckoutSession,
  } = useCheckoutState();

  const isPaymentStep = Boolean(clientSecret && customerSessionClientSecret);
  const price = selectedPlan ? selectedPlan.price : 0;
  const isRenewal = selectedPlan?.current ?? false;
  const isUpgrade =
    !!selectedPlan && !!currentPlan && selectedPlan.id !== currentPlan.id;

  // Explain *why* the submit CTA is disabled so the user isn't stuck
  // guessing at a greyed-out button.
  let disabledReason: string | null = null;
  if (!isPlansPending && selectedPlan) {
    if (currentPlan && selectedPlan.storage < currentPlan.storage) {
      disabledReason = t(
        "Downgrading to a smaller storage plan isn't supported. Pick a plan with at least {size} of storage.",
        {
          size: formatBytes(currentPlan.storage * 1024 * 1024 * 1024, {
            formatter: format,
          }),
        },
      );
    } else if (
      currentPlan &&
      currentPlan.id !== selectedPlan.id &&
      !selectedPlan.available
    ) {
      disabledReason = t(
        "{name} is sold out right now. Try again later or pick a different plan.",
        { name: selectedPlan.name },
      );
    } else if (!currentPlan && !selectedPlan.available) {
      disabledReason = t(
        "This plan is sold out. Please pick a different plan.",
      );
    }
  }

  const isSubmitDisabled =
    isCheckoutPending ||
    isPlansPending ||
    !selectedPlan ||
    disabledReason !== null;

  return (
    <div className="flex flex-col gap-4 p-5 xl:sticky xl:top-0">
      {isPlansPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
      ) : (
        <div className="flex flex-col">
          <h3 className="py-1 font-mono font-semibold text-foreground text-xl leading-none">
            {selectedPlan ? selectedPlan.name : t("Select a plan")}
          </h3>
          <span className="text-muted-foreground text-sm">
            {isPaymentStep ? t("Order summary") : t("Summary")}
          </span>
        </div>
      )}

      {isUpgrade && currentPlan && selectedPlan && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="sr-only">{t("Plan change")}:</span>
          <span className="truncate text-muted-foreground">
            {currentPlan.name}
          </span>
          <LucideArrowRight
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="truncate font-medium text-foreground">
            {selectedPlan.name}
          </span>
        </div>
      )}

      {isPlansPending ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-3/4" />
          ))}
        </ul>
      ) : (
        selectedPlan && (
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex items-center gap-2">
              <LucideCpu
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>
                {t(
                  "{cores, plural, =0 {# vCores} =1 {# vCore} other {# vCores}}",
                  { cores: selectedPlan.cores },
                )}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <LucideMemoryStick
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>
                {t("{memory} RAM", {
                  memory: formatBytes(selectedPlan.memory * 1024 * 1024, {
                    formatter: format,
                  }),
                })}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <LucideHardDrive
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>
                {t("{storage} NVMe SSD", {
                  storage: formatBytes(
                    selectedPlan.storage * 1024 * 1024 * 1024,
                    { formatter: format },
                  ),
                })}
              </span>
            </li>
            {selectedPlan.netrate !== null && (
              <li className="flex items-center gap-2">
                <LucideNetwork
                  className="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span>
                  {formatBits(selectedPlan.netrate * 1e6 * 8, {
                    formatter: format,
                    perSecond: true,
                    base: 1000,
                    unit: "gigabit",
                  })}
                </span>
              </li>
            )}
          </ul>
        )
      )}

      <Separator />

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          {isPlansPending ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <>
              <span className="font-medium text-2xl tabular-nums">
                {format.number(price / 100, {
                  style: "currency",
                  currency: "EUR",
                })}
              </span>
              <span className="text-muted-foreground text-sm">
                {t("/ month")}
              </span>
            </>
          )}
        </div>
        <span className="text-muted-foreground text-xs">
          {t("Incl. statutory VAT, if applicable")}
        </span>
      </div>

      {selectedPlan && (
        <p className="text-muted-foreground text-sm">
          {isRenewal
            ? t("Your current plan will be extended by one month.")
            : t(
                "The plan will be changed to {name} and the term will be extended by one month.",
                { name: selectedPlan.name },
              )}
        </p>
      )}

      {disabledReason && (
        <Alert variant="warning">
          <LucideTriangleAlert aria-hidden="true" />
          <AlertDescription>{disabledReason}</AlertDescription>
        </Alert>
      )}

      {isPaymentStep ? (
        <Button
          // Unique key so React unmounts this node before mounting the
          // submit button below, preventing the native click's default
          // action from resolving against a re-typed DOM element.
          key="back-to-plans"
          type="button"
          variant="outline"
          // Lock the back button while a payment is being confirmed so
          // the user can't yank the session out from under Stripe mid-
          // redirect.
          disabled={isCheckoutPending || isConfirmingPayment}
          onClick={(event) => {
            // Belt-and-suspenders: cancel the default action in case the
            // browser still has a click bubbling for this button after
            // React swaps the DOM.
            event.preventDefault();
            resetCheckoutSession();
          }}
        >
          <LucideArrowLeft aria-hidden="true" />
          {t("Change plan")}
        </Button>
      ) : (
        <Button
          key="continue-to-payment"
          type="submit"
          form="plan-form"
          disabled={isSubmitDisabled}
        >
          {isCheckoutPending ? (
            <Spinner />
          ) : (
            <LucideLock aria-hidden="true" strokeWidth={1.75} />
          )}
          {isCheckoutPending
            ? t("Preparing checkout…")
            : t("Continue to payment")}
        </Button>
      )}
    </div>
  );
}
