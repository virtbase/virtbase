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

import type { Stripe } from "@virtbase/api/stripe";
import { Button } from "@virtbase/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import type { LucideIcon } from "@virtbase/ui/icons/index";
import { LucideCreditCard, LucideLandmark } from "@virtbase/ui/icons/index";
import { Spinner } from "@virtbase/ui/spinner";
import { useRouter } from "next/navigation";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { startTransition, use, useActionState } from "react";
import { detatchPaymentMethodAction } from "../../api/billing/detach-payment-method";
import { ItemRow } from "../item-row";

export function PaymentMethodsList({
  promise,
}: {
  promise: Promise<Stripe.PaymentMethod[]>;
}) {
  const t = useExtracted();
  const paymentMethods = use(promise);

  if (!paymentMethods.length) {
    return (
      <Empty className="border" data-testid="empty-payment-methods">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideCreditCard aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No payment methods")}</EmptyTitle>
          <EmptyDescription>
            {t("No payment methods have been linked to your account.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return paymentMethods.map((paymentMethod) => {
    return (
      <PaymentMethodItem key={paymentMethod.id} paymentMethod={paymentMethod} />
    );
  });
}

const paymentMethodMapping = {
  card: {
    icon: LucideCreditCard,
    render: (method) => {
      return [`•••• ${method.last4}`];
    },
  },
  sepa_debit: {
    icon: LucideLandmark,
    render: (method) => {
      return [`•••• ${method.last4}`];
    },
  },
  paypal: {
    render: (method) => {
      return [method.payer_email];
    },
  },
  ideal: {
    icon: LucideLandmark,
    render: (method) => {
      return [method.bic];
    },
  },
} satisfies Partial<{
  [T in Stripe.PaymentMethod.Type]: {
    icon?: LucideIcon;
    render: (method: NonNullable<Stripe.PaymentMethod[T]>) => (string | null)[];
  };
}>;

type MappedPaymentMethod = keyof typeof paymentMethodMapping;

function PaymentMethodItem({
  paymentMethod,
}: {
  paymentMethod: Stripe.PaymentMethod;
}) {
  const t = useExtracted();
  const router = useRouter();

  const format = useFormatter();
  const now = useNow({ updateInterval: 1_000 });

  const method =
    paymentMethodMapping[paymentMethod.type as MappedPaymentMethod];
  const Icon = method && "icon" in method ? method.icon : LucideCreditCard;

  const [, disptachAction, isPending] = useActionState(
    detatchPaymentMethodAction.bind(null, paymentMethod.id),
    null,
  );

  const removePaymentMethod = () =>
    startTransition(() => {
      disptachAction();
      router.refresh();
    });

  return (
    <ItemRow
      data-testid="payment-method-item"
      icon={<Icon className="size-6 shrink-0" />}
      rightSide={
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <p
            className="whitespace-nowrap text-sm"
            data-testid="passkey-created-at"
            suppressHydrationWarning
          >
            {t("Added {date}", {
              date: format.relativeTime(paymentMethod.created * 1000, now),
            })}
          </p>
          <Button
            variant="outline"
            onClick={removePaymentMethod}
            disabled={isPending}
            data-testid="payment-method-remove-button"
          >
            {isPending ? <Spinner /> : t("Remove")}
          </Button>
        </div>
      }
    >
      <p className="font-medium text-sm">
        {paymentMethod.billing_details.name || t("Kein Name angegeben")}
      </p>
      <div className="flex items-center gap-2">
        {method
          ? method
              // @ts-expect-error - different payment method types have different properties
              .render(paymentMethod[paymentMethod.type])
              .filter((text): text is string => text !== null)
              .map((text, index) => (
                <span
                  key={index}
                  className="text-muted-foreground text-sm leading-none"
                >
                  {text}
                </span>
              ))
          : null}
      </div>
    </ItemRow>
  );
}
