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
import { useIsMobile } from "@virtbase/ui/hooks";
import { LucideTriangleAlert } from "@virtbase/ui/icons";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted, useFormatter } from "next-intl";

/** A subscription a removal would leave looking for another credential. */
export interface AffectedSubscription {
  id: string;
  /** The server it pays for, when that server still exists. */
  name: string | null;
  /** The end of the period it has already been paid for. */
  endsAt: Date;
}

/**
 * Confirms removing a saved credential, and says what it costs.
 *
 * **It warns and it never blocks.** A customer who wants their card off our
 * systems is entitled to take it off, whatever it does to their
 * subscriptions - refusing would be a dark pattern, and in Germany an
 * avoidable argument about the withdrawal a Kündigungsbutton is meant to make
 * easy rather than harder. So the destructive button is enabled in every
 * branch below, and the only thing the warnings change is what the customer
 * knows before they press it.
 *
 * Presentational: what is at stake is worked out by the list, which is the
 * thing that knows how many credentials are left and which subscriptions renew
 * on them.
 */
export function RemovePaymentMethodDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  isLastPaymentMethod,
  hasSurvivingDefault,
  affectedSubscriptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  /** Nothing is left on the account once this one is gone. */
  isLastPaymentMethod: boolean;
  /** A default other than this one survives, so renewals still have a target. */
  hasSurvivingDefault: boolean;
  /** Auto-renewing subscriptions this removal would affect. */
  affectedSubscriptions: AffectedSubscription[];
}) {
  const t = useExtracted();
  const format = useFormatter();
  const isMobile = useIsMobile();

  // The first period to run out is the deadline that matters: it is the date
  // by which a replacement has to exist for nothing to be lost.
  const firstEnding = affectedSubscriptions.reduce<Date | null>(
    (earliest, subscription) =>
      !earliest || subscription.endsAt < earliest
        ? subscription.endsAt
        : earliest,
    null,
  );

  const renewalsStop = affectedSubscriptions.length > 0 && !hasSurvivingDefault;
  const renewalsMove = affectedSubscriptions.length > 0 && hasSurvivingDefault;

  return (
    <ResponsiveDialog
      title={t("Remove this card?")}
      description={t("Remove this card?")}
      open={open}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            // Every other destructive confirmation in the app opens with the
            // way out focused, so a stray Enter dismisses rather than removes.
            autoFocus={!isMobile}
          >
            {t("Cancel")}
          </Button>
          {/*
           * Never disabled by a warning above it. See the note on the
           * component: the customer decides, we only make sure they are
           * deciding with the facts.
           */}
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending}
            data-testid="confirm-remove-payment-method"
          >
            {isPending && <Spinner />}
            {t("Remove card")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          {t(
            "It is detached from our payment provider straight away and can never be charged again. Receipts for payments you have already made are unaffected.",
          )}
        </p>

        {renewalsStop && (
          <Alert variant="warning" data-testid="remove-payment-method-warning">
            <LucideTriangleAlert aria-hidden="true" />
            <AlertTitle className="line-clamp-none">
              {t("Automatic renewal will stop")}
            </AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <p>
                {isLastPaymentMethod
                  ? t(
                      "This is the only card on your account, and {count} subscription(s) renew automatically. Once it is gone there is nothing left to charge them to.",
                      { count: `${affectedSubscriptions.length}` },
                    )
                  : t(
                      "This is the card renewals are charged to, and removing it leaves your account without one. {count} subscription(s) renew automatically and would have nothing to charge.",
                      { count: `${affectedSubscriptions.length}` },
                    )}
              </p>
              <p>
                {firstEnding
                  ? t(
                      "Nothing is switched off today: each one runs to the end of the period you have already paid for — the first on {date} — and then ends instead of renewing.",
                      {
                        date: format.dateTime(firstEnding, {
                          dateStyle: "long",
                        }),
                      },
                    )
                  : t(
                      "Nothing is switched off today: each one runs to the end of the period you have already paid for, and then ends instead of renewing.",
                    )}
              </p>
              <p>
                {t(
                  "You can still remove it. Add another card before then and renewals carry on as before.",
                )}
              </p>
            </AlertDescription>
          </Alert>
        )}

        {renewalsMove && (
          <Alert data-testid="remove-payment-method-notice">
            <LucideTriangleAlert aria-hidden="true" />
            <AlertTitle className="line-clamp-none">
              {t("Renewals move to your default card")}
            </AlertTitle>
            <AlertDescription>
              {t(
                "{count} subscription(s) renew on this card. They will be charged to the card you have chosen for renewals instead.",
                { count: `${affectedSubscriptions.length}` },
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ResponsiveDialog>
  );
}
