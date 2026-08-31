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

import { cn } from "@virtbase/ui";
import { Alert, AlertDescription } from "@virtbase/ui/alert";
import { buttonVariants } from "@virtbase/ui/button";
import { LucideTriangleAlert } from "@virtbase/ui/icons";
import { Label } from "@virtbase/ui/label";
import { Switch } from "@virtbase/ui/switch";
import NextLink from "next/link";
import { useExtracted, useFormatter } from "next-intl";
import { useId, useState } from "react";
import type { PaymentMethodState } from "@/features/account/utils/payment-method";
import type { Subscription } from "@/features/servers/hooks/billing/use-server-subscription";
import { paths } from "@/lib/paths";
import { MandateDialog } from "./mandate-dialog";

/**
 * Re-exported, not declared.
 *
 * The one rule about whether a credential could be charged lives in
 * `features/account/utils/payment-method`, next to the health the billing page
 * renders from, so the two screens cannot answer differently. This export is
 * only here because the plan card has always imported the type from its
 * consumer.
 */
export type { PaymentMethodState };

interface AutoRenewSectionProps {
  subscription: Subscription;
  /** What a renewal costs today, in cents. Null while the plan is loading. */
  renewalAmount: number | null;
  paymentMethodState: PaymentMethodState;
  /** Records consent. The parent turns the switch on once it has succeeded. */
  onAcceptMandate: (version: string) => void;
  onSetAutoRenew: (enabled: boolean) => void;
  isPending: boolean;
  /** Whatever the server refused with, verbatim. */
  errorMessage?: string | null;
}

/**
 * The automatic-renewal opt-in.
 *
 * **Turning it on is a flow, not a flag.** The server refuses the flag without
 * a usable credential and a recorded mandate, so this walks the customer
 * through whichever is missing instead of letting them discover it as a failed
 * switch:
 *
 * - no usable credential -> the reason, named, with a link to the page that
 *   fixes it. Never a generic failure, and never a dead end.
 * - no *answer yet* about the credential -> said as exactly that. The saved
 *   list is a separate query, and a click in the second before it lands used
 *   to be answered with "Add a payment method first" over a billing page that
 *   already listed the customer's default card - a false accusation that then
 *   flickered away unexplained. Being told to wait is worse than being enrolled
 *   and better than being lied to; enrolling on the customer's behalf once the
 *   answer arrived was the other option, and it is not one, because it would
 *   open a consent dialog, or record consent, for a click the customer has
 *   already looked away from.
 * - no recorded mandate -> the wording, in a dialog they have to actively
 *   agree to. `onAcceptMandate` records it; the parent turns the switch on
 *   once that has actually succeeded.
 * - no price to put in that wording -> said out loud, because the alternative
 *   is a click that does nothing at all. `renewalAmount` is null while the
 *   plan query is loading, when it has failed, and when the server's plan is
 *   not in what came back; the mandate has to state the actual amount, so
 *   none of the three may open the dialog. The remedy is the same in all
 *   three - wait a moment, or reload - so they get one sentence.
 *
 * The switch stays *enabled* while a precondition is missing, this one
 * included. Disabling it would be tidier and would tell the customer nothing
 * about why - the click is what earns them the explanation.
 *
 * It lives inside "Your plan" on the server's plan page, directly under the
 * term it decides the outcome of and the credential it would charge. Whoever
 * renders it owns the query client; this component is pure and is handed the
 * subscription, the price and the two callbacks.
 *
 * **Turning it off has no flow at all.** One click, no confirmation, no
 * "are you sure": withdrawing consent to be charged is never something to
 * gate, and the same reasoning as §312k applies even though this is not the
 * cancellation button.
 */
export function AutoRenewSection({
  subscription,
  renewalAmount,
  paymentMethodState,
  onAcceptMandate,
  onSetAutoRenew,
  isPending,
  errorMessage,
}: AutoRenewSectionProps) {
  const t = useExtracted();
  const format = useFormatter();
  const switchId = useId();

  const [showMandate, setShowMandate] = useState(false);
  /**
   * What the last click ran into, if anything.
   *
   * One value rather than a flag per reason: a click is refused for exactly
   * one thing, and two alerts appearing at once would be two answers to a
   * question with one. Set by the click that was refused, so the explanation
   * appears where the customer is looking rather than in a toast that has gone
   * by the time they scroll back.
   *
   * Every path out of `handleChange` sets it - to a reason, or to null - which
   * is what makes "the switch always produces a visible outcome" a property of
   * the handler rather than of the reader's memory.
   */
  const [blockedOn, setBlockedOn] = useState<
    "checking" | "payment-method" | "price" | null
  >(null);

  // The dialog closes itself: consent lands in `mandate_accepted_at`, the list
  // query is invalidated, and the condition below stops holding. No callback
  // has to reach back in here to shut it.
  const isMandateOpen = showMandate && !subscription.mandate_accepted_at;

  // What the collector will act on. `cancelled` is resumed first; `suspended`
  // and `ended` cannot renew at all.
  const canRenew =
    "active" === subscription.status || "past_due" === subscription.status;

  const isCheckingMethod = "loading" === paymentMethodState;
  const hasUsableMethod = "usable" === paymentMethodState;

  const handleChange = (next: boolean) => {
    if (!next) {
      setBlockedOn(null);
      onSetAutoRenew(false);
      return;
    }

    // "We do not know yet" is its own answer and gets its own sentence. It is
    // not "you have no card": that is a different fact, and the customer can
    // see it is untrue on the page this one links to.
    if (isCheckingMethod) {
      setBlockedOn("checking");
      return;
    }

    if (!hasUsableMethod) {
      setBlockedOn("payment-method");
      return;
    }

    if (!subscription.mandate_accepted_at) {
      // Consent has to name the amount - see `MandateDialog`. Without one
      // there is no wording to agree to, so the dialog must not open, and the
      // customer is told that rather than left with a switch that snapped
      // back. An already-recorded mandate needs no price and is unaffected.
      if (renewalAmount == null) {
        setBlockedOn("price");
        return;
      }

      setBlockedOn(null);
      setShowMandate(true);
      return;
    }

    setBlockedOn(null);
    onSetAutoRenew(true);
  };

  const price =
    renewalAmount == null
      ? null
      : format.number(renewalAmount / 100, {
          style: "currency",
          currency: subscription.currency,
        });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={switchId}>{t("Automatic renewal")}</Label>
          <p className="text-muted-foreground text-sm">
            {subscription.auto_renew
              ? price
                ? t(
                    "Your server renews by itself. We charge {price} at the end of each term.",
                    { price },
                  )
                : t("Your server renews by itself at the end of each term.")
              : t(
                  "Your server will not renew by itself. It stops at the end of the current term unless you extend it.",
                )}
          </p>
        </div>
        <Switch
          id={switchId}
          data-testid="auto-renew-switch"
          checked={subscription.auto_renew}
          onCheckedChange={handleChange}
          disabled={isPending || !canRenew}
          aria-label={t("Automatic renewal")}
        />
      </div>

      {!canRenew && !subscription.auto_renew && (
        <p className="text-muted-foreground text-sm">
          {"cancelled" === subscription.status
            ? t(
                "Resume this subscription before turning automatic renewal back on.",
              )
            : t("This subscription can no longer renew.")}
        </p>
      )}

      {/*
       * Held to `loading`, the same way the two below are held to the
       * condition that raised them: the answer arriving is what takes the
       * sentence away, and the customer's next click is then the real one.
       */}
      {"checking" === blockedOn && isCheckingMethod && (
        <Alert variant="warning" data-testid="auto-renew-checking">
          <LucideTriangleAlert aria-hidden="true" />
          <AlertDescription>
            <p className="text-foreground">
              {t(
                "We are still checking which card would be charged. Give it a moment, then try again.",
              )}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {"payment-method" === blockedOn &&
        !hasUsableMethod &&
        !isCheckingMethod && (
          <Alert variant="warning" data-testid="auto-renew-blocked">
            <LucideTriangleAlert aria-hidden="true" />
            <AlertDescription>
              <p className="text-foreground">
                {"unusable" === paymentMethodState
                  ? t(
                      "The payment method we would charge cannot be used. Pick a different default on the payment methods page, then turn automatic renewal on.",
                    )
                  : t(
                      "Add a payment method first. Automatic renewal needs a card we can charge when your term ends.",
                    )}
              </p>
              <NextLink
                href={paths.app.account.settings.billing.getHref()}
                prefetch={false}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "mt-2",
                )}
              >
                {t("Manage payment methods")}
              </NextLink>
            </AlertDescription>
          </Alert>
        )}

      {"price" === blockedOn && renewalAmount == null && (
        <Alert variant="warning" data-testid="auto-renew-price-unavailable">
          <LucideTriangleAlert aria-hidden="true" />
          <AlertDescription>
            <p className="text-foreground">
              {t(
                "We cannot work out what this renewal would cost right now, and we will not ask you to agree to an amount we cannot show you. Give it a moment, then try again - or reload the page.",
              )}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {errorMessage && !isMandateOpen && (
        <Alert variant="destructive" data-testid="auto-renew-error">
          <LucideTriangleAlert aria-hidden="true" />
          <AlertDescription>
            <p className="text-foreground">{errorMessage}</p>
          </AlertDescription>
        </Alert>
      )}

      {/*
       * The price is what makes this dialog legible as consent, so it is a
       * condition of rendering it. It is no longer a condition the click can
       * fall through: `handleChange` refuses a missing price above and says
       * so, rather than opening a dialog that is not here.
       */}
      {renewalAmount != null && (
        <MandateDialog
          open={isMandateOpen}
          onOpenChange={setShowMandate}
          amount={renewalAmount}
          currency={subscription.currency}
          intervalMonths={subscription.interval_months}
          periodEnd={subscription.current_period_end}
          paymentMethod={subscription.payment_method}
          onAccept={onAcceptMandate}
          isPending={isPending}
          errorMessage={errorMessage}
        />
      )}
    </div>
  );
}
