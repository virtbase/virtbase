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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { LucideCreditCard, LucideTriangleAlert } from "@virtbase/ui/icons";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { useAutoRenewingSubscriptions } from "@/features/account/hooks/billing/auto-renewing-subscriptions";
import type { PaymentMethodSummary } from "@/features/account/hooks/billing/payment-methods-list";
import { usePaymentMethodsList } from "@/features/account/hooks/billing/payment-methods-list";
import { useRemovePaymentMethod } from "@/features/account/hooks/billing/remove-payment-method";
import { useSetDefaultPaymentMethod } from "@/features/account/hooks/billing/set-default-payment-method";
import { PaymentMethodItem } from "./payment-method-item";
import type { AffectedSubscription } from "./remove-payment-method-dialog";
import { RemovePaymentMethodDialog } from "./remove-payment-method-dialog";

/**
 * The saved credentials on the account, and the two things you can do to one.
 *
 * This is the component that knows the whole set, which is why the remove
 * confirmation is owned here rather than by the row: whether a removal leaves
 * renewals with nothing to charge is a question about the other rows and about
 * the subscriptions, not about the card being removed.
 */
export function PaymentMethodsList() {
  const t = useExtracted();

  const {
    data: { payment_methods: paymentMethods },
  } = usePaymentMethodsList();

  const { subscriptions: autoRenewing } = useAutoRenewingSubscriptions();

  const [pendingRemoval, setPendingRemoval] =
    useState<PaymentMethodSummary | null>(null);

  const {
    mutate: setDefault,
    variables: setDefaultVariables,
    isPending: isSettingDefault,
  } = useSetDefaultPaymentMethod();

  const { mutate: removePaymentMethod } = useRemovePaymentMethod();

  if (!paymentMethods.length) {
    return (
      <Empty className="border" data-testid="empty-payment-methods">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideCreditCard aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No payment methods")}</EmptyTitle>
          <EmptyDescription>
            {t(
              "No cards have been saved yet. A subscription cannot renew without one.",
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // `removePaymentMethod` never promotes the next card, on purpose, so an
  // account can sit here with cards and nothing chosen. Renewals then have
  // nothing to charge, and the only place that can say so is this list.
  const hasDefault = paymentMethods.some((method) => method.is_default);

  const affectedSubscriptions: AffectedSubscription[] = pendingRemoval
    ? autoRenewing
        // `payment_method` is already resolved server-side to the credential a
        // renewal would actually charge - the one the subscription names, or
        // the account default when it names none - so this one comparison
        // covers both.
        .filter(
          (subscription) =>
            subscription.payment_method?.id === pendingRemoval.id,
        )
        .map((subscription) => ({
          id: subscription.id,
          name: subscription.subject_name,
          endsAt: subscription.current_period_end,
        }))
    : [];

  const hasSurvivingDefault = pendingRemoval
    ? paymentMethods.some(
        (method) => method.id !== pendingRemoval.id && method.is_default,
      )
    : false;

  return (
    <>
      {!hasDefault && (
        <Alert
          variant="warning"
          className="mb-4"
          data-testid="no-default-payment-method"
        >
          <LucideTriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">
            {t("No card is chosen for renewals")}
          </AlertTitle>
          <AlertDescription>
            {t(
              "A renewal has nothing to charge, so the subscription ends when its period does. Pick a card below with “Use for renewals”.",
            )}
          </AlertDescription>
        </Alert>
      )}

      {paymentMethods.map((paymentMethod) => (
        <PaymentMethodItem
          key={paymentMethod.id}
          paymentMethod={paymentMethod}
          isSettingDefault={
            isSettingDefault && setDefaultVariables?.id === paymentMethod.id
          }
          onSetDefault={() => setDefault({ id: paymentMethod.id })}
          onRemove={() => setPendingRemoval(paymentMethod)}
        />
      ))}

      <RemovePaymentMethodDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        // The mutation is optimistic and rolls back with a toast of its own, so
        // the dialog closes on the press rather than holding the customer in
        // front of a spinner for a round trip they cannot influence.
        isPending={false}
        onConfirm={() => {
          if (!pendingRemoval) return;
          removePaymentMethod({ id: pendingRemoval.id });
          setPendingRemoval(null);
        }}
        isLastPaymentMethod={paymentMethods.length === 1}
        hasSurvivingDefault={hasSurvivingDefault}
        affectedSubscriptions={affectedSubscriptions}
      />
    </>
  );
}
