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

import {
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
} from "@virtbase/ui/field";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useExtracted } from "next-intl";
import { Controller } from "react-hook-form";
import { CheckoutWaivers } from "@/features/checkout/components/checkout-waivers";
import { ElementsProvider } from "@/features/checkout/components/elements-provider";
import { StripePaymentForm } from "@/features/checkout/components/stripe-payment-form";
import { useCheckoutState } from "@/features/checkout/hooks/use-checkout-state";
import { usePlanContext } from "./plan-context";
import { PlanRadioGroup } from "./plan-radio-group";

export function PlanForm() {
  const t = useExtracted();

  const {
    paymentIntentId,
    customerSessionClientSecret,
    clientSecret,
    createOrder,
    isPending: isOrderPending,
  } = useCheckoutState();

  const {
    form,
    currentPlan,
    plans,
    isPending: isPlansPending,
    setIsConfirmingPayment,
  } = usePlanContext();

  const isDisabled = isPlansPending || isOrderPending;

  if (clientSecret && customerSessionClientSecret) {
    return (
      <ElementsProvider
        customerSessionClientSecret={customerSessionClientSecret}
        clientSecret={clientSecret}
      >
        <StripePaymentForm
          paymentIntentId={paymentIntentId}
          onProcessingChange={setIsConfirmingPayment}
        />
      </ElementsProvider>
    );
  }

  return (
    <form
      id="plan-form"
      onSubmit={form.handleSubmit((data) => createOrder(data))}
    >
      <FieldGroup>
        <Controller
          name="server_plan_id"
          control={form.control}
          disabled={isDisabled}
          render={({ field, fieldState }) => (
            <FieldGroup data-invalid={fieldState.invalid}>
              <FieldSet className="gap-1">
                <FieldLabel>{t("Plan")}</FieldLabel>
                <FieldDescription className="text-balance">
                  {t(
                    "Select a new plan or extend your current plan. Downgrading to a smaller storage plan is not supported.",
                  )}
                </FieldDescription>
              </FieldSet>
              {isPlansPending ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full" />
                ))
              ) : (
                <PlanRadioGroup
                  name={field.name}
                  value={field.value}
                  disabled={field.disabled}
                  onValueChange={(value) => {
                    field.onChange(value);
                    // `type` is derived from the selection; keep the
                    // discriminated-union field in sync right at the source
                    // so the zod resolver always validates the correct branch.
                    form.setValue(
                      "type",
                      currentPlan && value === currentPlan.id
                        ? "extend_server"
                        : "upgrade_server",
                      { shouldValidate: form.formState.isSubmitted },
                    );
                  }}
                  plans={plans}
                  currentPlan={currentPlan}
                />
              )}
            </FieldGroup>
          )}
        />
        <FieldSeparator />
        <CheckoutWaivers control={form.control} external />
      </FieldGroup>
    </form>
  );
}
