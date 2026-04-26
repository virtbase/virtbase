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
import { Button } from "@virtbase/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@virtbase/ui/field";
import {
  LucideCircleQuestionMark,
  LucideShoppingCart,
} from "@virtbase/ui/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import { Spinner } from "@virtbase/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@virtbase/ui/tooltip";
import { OrderNewServerPlanInputSchema } from "@virtbase/validators";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { use, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { PasswordRequirements } from "@/features/auth/components/password-requirements";
import {
  RandomPasswordAddon,
  ShowPasswordAddon,
} from "@/ui/input-group-addons";
import { OperatingSystemSelect } from "@/ui/operating-system-select";
import type { getTemplateGroups } from "../api/get-template-groups";
import { useCheckoutState } from "../hooks/use-checkout-state";
import { CheckoutWaivers } from "./checkout-waivers";
import { ElementsProvider } from "./elements-provider";
import { StripePaymentForm } from "./stripe-payment-form";

// TODO: Re-add SSH key selection
export function CheckoutForm({
  promise,
}: {
  promise: ReturnType<typeof getTemplateGroups>;
}) {
  const t = useExtracted();

  const { id: planId } = useParams<{ id: string }>();
  const {
    paymentIntentId,
    customerSessionClientSecret,
    clientSecret,
    createOrder,
    isPending,
  } = useCheckoutState();

  const templateGroups = use(promise);

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const form = useForm({
    resolver: zodResolver(OrderNewServerPlanInputSchema),
    defaultValues: {
      server_plan_id: planId,
      type: "new_server",
      terms: false,
      waiver: false,
    },
  });

  if (clientSecret && customerSessionClientSecret) {
    return (
      <ElementsProvider
        customerSessionClientSecret={customerSessionClientSecret}
        clientSecret={clientSecret}
      >
        <StripePaymentForm paymentIntentId={paymentIntentId} />
      </ElementsProvider>
    );
  }

  return (
    <form
      id="checkout-form"
      onSubmit={form.handleSubmit((data) => createOrder(data))}
    >
      <FieldGroup>
        <h3 className="font-semibold">{t("Configuration")}</h3>
        <Controller
          name="template_id"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>
                {t("Operating System")}
              </FieldLabel>
              <OperatingSystemSelect
                id={field.name}
                name={field.name}
                value={field.value ?? ""}
                onValueChange={field.onChange}
                templateGroups={templateGroups}
                aria-invalid={fieldState.invalid}
              />
            </Field>
          )}
        />
        <Controller
          name="root_password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center gap-2">
                <FieldLabel htmlFor={field.name}>
                  {t("Root Password (optional)")}
                </FieldLabel>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger type="button">
                      <LucideCircleQuestionMark className="size-4 shrink-0 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent
                      className="max-w-xs px-4 py-2 text-center text-sm"
                      align="end"
                    >
                      {t(
                        "Virtbase does not store your root password. It can be reset via the customer portal afterwards.",
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <FieldDescription>
                {t(
                  "If left blank, a secure random password will be generated and sent by email.",
                )}
              </FieldDescription>
              <InputGroup>
                <InputGroupInput
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  placeholder="********"
                  type={!isPasswordVisible ? "password" : "text"}
                  {...field}
                  onChange={(e) =>
                    field.onChange(e.target.value.trim() || undefined)
                  }
                  value={field.value ?? ""}
                />
                <InputGroupAddon align="inline-end">
                  <RandomPasswordAddon
                    onClick={(password) => {
                      form.setValue("root_password", password, {
                        shouldDirty: true,
                        shouldValidate: true,
                        shouldTouch: true,
                      });
                      setIsPasswordVisible(true);
                    }}
                    disabled={form.formState.disabled}
                  />
                  <ShowPasswordAddon
                    isPasswordVisible={isPasswordVisible}
                    setIsPasswordVisible={setIsPasswordVisible}
                    disabled={form.formState.disabled}
                  />
                </InputGroupAddon>
              </InputGroup>
              <PasswordRequirements
                field={field}
                invalid={fieldState.invalid}
              />
            </Field>
          )}
        />
        <FieldSeparator />
        <CheckoutWaivers control={form.control} external={false} />
        <FieldSeparator />
        <div className="flex justify-end">
          <Button type="submit" form="checkout-form" disabled={isPending}>
            {isPending ? (
              <Spinner />
            ) : (
              <LucideShoppingCart
                className="size-4 shrink-0"
                aria-hidden="true"
              />
            )}
            {t("Continue to payment")}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
