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
import { Badge } from "@virtbase/ui/badge";
import { Button } from "@virtbase/ui/button";
import {
  LucideCreditCard,
  LucideLandmark,
  LucideTriangleAlert,
  LucideWallet,
} from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted, useNow } from "next-intl";
import { ItemRow } from "@/features/account/components/item-row";
import type { PaymentMethodSummary } from "@/features/account/hooks/billing/payment-methods-list";
import {
  classifyInvalidReason,
  formatExpiry,
  resolveBrandName,
  resolvePaymentMethodHealth,
} from "@/features/account/utils/payment-method";

/**
 * One saved credential.
 *
 * Presentational: it is handed the two actions rather than calling the
 * mutations itself, unlike `SSHKeyItem`. Removing needs a confirmation that
 * has to know how many credentials are left and which subscriptions renew on
 * them - facts that live in the list, not in the row - and keeping the row
 * free of the query client is also what makes it renderable in a test.
 *
 * Nothing here reaches for a field the API does not return. There is no
 * `provider` and no `external_id` on the wire, the id is never written into
 * the markup, and `invalid_reason` is classified before it is used rather than
 * printed: it is the processor's own decline code, and a customer reading
 * `revocation_of_all_authorizations` learns nothing they can act on.
 */
export function PaymentMethodItem({
  paymentMethod,
  onSetDefault,
  onRemove,
  isSettingDefault = false,
  isRemoving = false,
}: {
  paymentMethod: PaymentMethodSummary;
  onSetDefault: () => void;
  onRemove: () => void;
  isSettingDefault?: boolean;
  isRemoving?: boolean;
}) {
  const t = useExtracted();
  const now = useNow();

  const health = resolvePaymentMethodHealth(paymentMethod, now);
  const expiry = formatExpiry(paymentMethod);

  const instrument =
    resolveBrandName(paymentMethod.brand) ??
    (paymentMethod.type === "card"
      ? t("Card")
      : paymentMethod.type === "sepa_debit"
        ? t("SEPA Direct Debit")
        : paymentMethod.type === "paypal"
          ? t("PayPal")
          : t("Payment method"));

  const Icon =
    paymentMethod.type === "card"
      ? LucideCreditCard
      : paymentMethod.type === "sepa_debit"
        ? LucideLandmark
        : LucideWallet;

  // Read out rather than shown: a screen reader announcing four bullets and
  // then four digits is not a card anyone can tell apart from the next one.
  const spokenName = paymentMethod.last4
    ? t("{instrument} ending {last4}", {
        instrument,
        last4: paymentMethod.last4,
      })
    : instrument;

  return (
    <ItemRow
      data-testid="payment-method-item"
      icon={<Icon className="size-6 shrink-0" aria-hidden="true" />}
      rightSide={
        /* `lg` is where `ItemRow` itself turns into a row, and where the SSH
           key and passkey lists reflow their actions. */
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          {/*
           * Offered only for a credential that could actually be charged.
           * Pointing renewals at a card the issuer has already buried is a
           * setting that reads as done and fails at the next collection.
           */}
          {!paymentMethod.is_default && health === "usable" && (
            <Button
              variant="outline"
              onClick={onSetDefault}
              disabled={isSettingDefault || isRemoving}
              aria-label={t("Use {card} for renewals", { card: spokenName })}
              data-testid="payment-method-set-default"
            >
              {isSettingDefault && <Spinner />}
              {t("Use for renewals")}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onRemove}
            disabled={isRemoving}
            aria-label={t("Remove {card}", { card: spokenName })}
            data-testid="payment-method-remove"
          >
            {isRemoving && <Spinner />}
            {t("Remove")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-sm">
          {paymentMethod.last4
            ? `${instrument} •••• ${paymentMethod.last4}`
            : instrument}
        </p>
        {paymentMethod.is_default && (
          <Badge variant="secondary" data-testid="payment-method-default">
            {t("Default")}
          </Badge>
        )}
      </div>

      {health === "usable" ? (
        <p className="text-muted-foreground text-sm leading-none">
          {expiry
            ? t("Expires {date}", { date: expiry })
            : t("Charged when a subscription renews.")}
        </p>
      ) : (
        <PaymentMethodProblem
          health={health}
          expiry={expiry}
          invalidReason={paymentMethod.invalid_reason}
        />
      )}
    </ItemRow>
  );
}

/**
 * Why a credential cannot be charged, and what to do about it.
 *
 * An `Alert` rather than a badge: a dead card is work the customer has to do
 * before the next renewal, and a neutral chip beside the number is something
 * people read as decoration. `role="alert"` comes with the component, so it is
 * also announced instead of sitting silently in the row.
 */
function PaymentMethodProblem({
  health,
  expiry,
  invalidReason,
}: {
  health: "expired" | "unusable";
  expiry: string | null;
  invalidReason: string | null;
}) {
  const t = useExtracted();

  if (health === "expired") {
    return (
      <Alert variant="destructive" data-testid="payment-method-problem">
        <LucideTriangleAlert aria-hidden="true" />
        <AlertTitle className="line-clamp-none">
          {t("Expired — replace it to keep automatic renewal")}
        </AlertTitle>
        <AlertDescription>
          {expiry
            ? t(
                "This card expired in {date}. Add a new one, choose it for renewals, and then remove this one.",
                { date: expiry },
              )
            : t(
                "This card has expired. Add a new one, choose it for renewals, and then remove this one.",
              )}
        </AlertDescription>
      </Alert>
    );
  }

  /*
   * Two sentences, and deliberately not five.
   *
   * `classifyInvalidReason` is the dunning mail's own classification, and a
   * lost, stolen or picked-up card arrives here as `declinedByBank` - the same
   * value a plain refusal has, and therefore the same words on the page. That
   * is not vagueness for its own sake: the issuer's guidance is not to tell the
   * person holding the card that it has been reported, because the person
   * holding it is not always the customer, and a logged-in session is a weaker
   * proof of who is reading than the address the mail goes to. Whoever is here
   * still learns that the card cannot be charged and what to do instead, which
   * is the whole of what they can act on.
   *
   * Splitting this branch back out by code is the defect, not a refinement.
   */
  const reason = classifyInvalidReason(invalidReason);

  const title =
    reason === "cardUnusable"
      ? t("Stopped by your bank — replace it to keep automatic renewal")
      : t("Refused — replace it to keep automatic renewal");

  const description =
    reason === "cardUnusable"
      ? t(
          "The permission to charge it was withdrawn, so renewals can no longer use it. Add another card and choose it for renewals.",
        )
      : t(
          "Your bank refused the last renewal and told us not to try again. They do not tell us why, so they are the ones who can say. Add another card and choose it for renewals.",
        );

  return (
    <Alert variant="destructive" data-testid="payment-method-problem">
      <LucideTriangleAlert aria-hidden="true" />
      <AlertTitle className="line-clamp-none">{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
