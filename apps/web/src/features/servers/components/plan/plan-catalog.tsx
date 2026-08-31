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
import { LucideCircleAlert } from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useExtracted } from "next-intl";
import { usePlanContext } from "./plan-context";
import { PlanList } from "./plan-list";

/**
 * The card's whole content: the list of plans, and what to do about an order
 * nobody finished.
 *
 * There is deliberately no form, no selection and no submit button here.
 * Reading the list is browsing; buying is a decision, and a decision is made
 * with a named button that opens a dialog stating the price and asking for
 * consent before anything is created.
 */
export function PlanCatalog() {
  const { plans, currentPlan, isPending, openAction, hasOrder, isOpen } =
    usePlanContext();

  return (
    <div className="flex flex-col gap-4">
      {hasOrder && !isOpen && <UnpaidOrderAlert />}

      {isPending ? (
        <Skeleton className="-m-px h-72 w-full" />
      ) : (
        <PlanList
          plans={plans}
          currentPlan={currentPlan}
          onUpgrade={(planId) => openAction({ mode: "upgrade", planId })}
          onExtend={(planId) => openAction({ mode: "extend", planId })}
        />
      )}
    </div>
  );
}

/**
 * An order was created and the dialog was closed before it was paid for.
 *
 * Closing a dialog mid-flight is easy to do by accident, and the order it
 * leaves behind is real - it exists on the account and it has a payment
 * intent. Saying so is the honest option: the alternative is a customer who
 * believes nothing happened and an order that says otherwise. Both ways out
 * are one press, and neither is the default.
 */
function UnpaidOrderAlert() {
  const t = useExtracted();
  const { orderedPlan, resumeOrder, discardOrder } = usePlanContext();

  return (
    <Alert variant="warning" data-testid="unpaid-order">
      <LucideCircleAlert aria-hidden="true" />
      <AlertTitle>{t("An order is waiting to be paid")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>
          {orderedPlan
            ? t(
                "You closed the payment for {name} before it went through. Nothing has been charged and this server is still on its current plan.",
                { name: orderedPlan.name },
              )
            : t(
                "You closed a payment before it went through. Nothing has been charged and this server is still on its current plan.",
              )}
        </span>
        <span className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={resumeOrder}
            data-testid="resume-order"
          >
            {t("Resume payment")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={discardOrder}
            data-testid="discard-order"
          >
            {t("Discard it")}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
