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

import { Button } from "@virtbase/ui/button";
import { LucideCreditCard } from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import NextLink from "next/link";
import { useExtracted, useNow } from "next-intl";
import { ItemRow } from "@/features/account/components/item-row";
import type { PaymentMethodDisplayFields } from "@/features/account/utils/payment-method";
import {
  classifyInvalidReason,
  formatExpiry,
  resolveBrandName,
  resolvePaymentMethodHealth,
} from "@/features/account/utils/payment-method";
import { paths } from "@/lib/paths";

/** A saved credential, as this component needs to see one. */
export type SavedPaymentMethod = PaymentMethodDisplayFields & { id: string };

interface RenewalPaymentMethodProps {
  /**
   * The credential a renewal would actually charge.
   *
   * Taken from the subscription rather than picked out of the saved list here:
   * the server has already resolved "the one this subscription names, or the
   * account default when it names none", and a second implementation of that
   * rule in the browser is a second chance to show a customer a card that is
   * not the one their money will come off.
   */
  chargeable: { id: string; brand: string | null; last4: string | null } | null;
  /**
   * The saved credentials, which is where the health lives.
   *
   * `subscription.payment_method` deliberately carries neither `invalid_at`
   * nor an expiry, so whether the charge would go through can only be answered
   * by matching the id against this list. `undefined` while it loads.
   */
  saved: SavedPaymentMethod[] | undefined;
  isPending: boolean;
}

/**
 * What pays for this server, and whether it still can.
 *
 * One row in the plan card's list of facts, built like every other row on the
 * account pages: the credential is the title, its health is the subtitle, and
 * the way to change it is a button on the right rather than a link buried in
 * the sentence.
 *
 * This is the line a customer looks at when a renewal has failed, so a dead
 * card says so here in as many words instead of being rendered as an ordinary
 * four digits with the bad news left on another page.
 */
export function RenewalPaymentMethod({
  chargeable,
  saved,
  isPending,
}: RenewalPaymentMethodProps) {
  const t = useExtracted();
  const now = useNow();

  if (isPending) {
    return (
      <Skeleton
        className="-m-px h-24 w-full"
        data-testid="payment-method-loading"
      />
    );
  }

  if (!chargeable) {
    return (
      <ItemRow
        data-testid="renewal-payment-method"
        icon={
          <LucideCreditCard className="size-6 shrink-0" aria-hidden="true" />
        }
        rightSide={
          <Button variant="outline" asChild>
            <NextLink
              href={paths.app.account.settings.billing.getHref()}
              prefetch={false}
            >
              {t("Add a payment method")}
            </NextLink>
          </Button>
        }
      >
        <p className="truncate font-medium text-sm">{t("None chosen")}</p>
        <p className="truncate text-muted-foreground text-sm leading-none">
          {t("A renewal has nothing to charge until you choose a card.")}
        </p>
      </ItemRow>
    );
  }

  // Matched by id, so the health shown belongs to the credential named above
  // and not to whichever card happens to be the account default.
  const row = saved?.find((method) => method.id === chargeable.id);
  const health = row ? resolvePaymentMethodHealth(row, now) : "usable";
  const expiry = row ? formatExpiry(row) : null;

  const instrument = resolveBrandName(chargeable.brand) ?? t("Card");
  const label = chargeable.last4
    ? `${instrument} •••• ${chargeable.last4}`
    : instrument;

  return (
    <ItemRow
      data-testid="renewal-payment-method"
      icon={<LucideCreditCard className="size-6 shrink-0" aria-hidden="true" />}
      rightSide={
        <Button variant="outline" asChild>
          <NextLink
            href={paths.app.account.settings.billing.getHref()}
            prefetch={false}
          >
            {t("Change")}
          </NextLink>
        </Button>
      }
    >
      <p className="truncate font-medium text-sm">{label}</p>
      {health === "usable" ? (
        <p className="truncate text-muted-foreground text-sm leading-none">
          {expiry
            ? t("Expires {date}", { date: expiry })
            : t("Charged when this server renews.")}
        </p>
      ) : (
        <p
          className="text-destructive text-sm leading-none"
          data-testid="renewal-payment-method-problem"
        >
          {health === "expired"
            ? expiry
              ? t("Expired {date}. Replace it or the next renewal fails.", {
                  date: expiry,
                })
              : t("This card has expired. The next renewal will fail.")
            : classifyInvalidReason(row?.invalid_reason ?? null) ===
                "cardUnusable"
              ? t(
                  "Your bank withdrew permission to charge this card. The next renewal will fail.",
                )
              : t(
                  "Your bank refused this card. The next renewal will fail until you choose another.",
                )}
        </p>
      )}
    </ItemRow>
  );
}
