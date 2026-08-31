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
import { Checkbox } from "@virtbase/ui/checkbox";
import { useIsMobile } from "@virtbase/ui/hooks";
import { LucideTriangleAlert } from "@virtbase/ui/icons";
import { Label } from "@virtbase/ui/label";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { SUBSCRIPTION_MANDATE_TEXT_VERSION } from "@virtbase/validators";
import { useExtracted, useFormatter } from "next-intl";
import { useId, useState } from "react";

interface MandateDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {
  /** What a renewal costs today, in the smallest unit of `currency`. */
  amount: number;
  currency: string;
  intervalMonths: number;
  /** When the term runs out, which is when the first automatic charge falls. */
  periodEnd: Date;
  paymentMethod: { brand: string | null; last4: string | null } | null;
  /** Called with the version of the wording rendered below. */
  onAccept: (version: string) => void;
  isPending: boolean;
  /** A refusal from the server, shown where the wording is. */
  errorMessage?: string | null;
}

/**
 * The wording a customer has to actively agree to before we may charge them
 * while they are not present.
 *
 * ## What this text has to say, and why
 *
 * A merchant-initiated charge with no recorded consent is one the provider
 * reverses on request, and "they clicked something" is not consent. Four
 * things are therefore stated in the body, and none of them may be dropped to
 * make the dialog shorter:
 *
 * 1. **what** will be charged - the actual amount, not "your plan price",
 * 2. **how often** - the real interval, taken from the subscription,
 * 3. that it happens **automatically**, with nothing further to do and no
 *    per-charge confirmation,
 * 4. **how to stop it** - both the switch this was opened from and the
 *    cancellation button, which are on the same page, one section apart.
 *
 * ## The box starts empty
 *
 * A pre-ticked box is not consent, and neither is a dialog whose only button
 * is "Agree". The checkbox below is unchecked on every open - it is local
 * state seeded to `false`, never from a prop - and the button that records the
 * consent is disabled until the customer ticks it themselves.
 *
 * ## The version travels with the text
 *
 * `onAccept` is handed {@link SUBSCRIPTION_MANDATE_TEXT_VERSION}, the version
 * of the wording rendered here, and the server refuses anything else. The two
 * move together on purpose: the day this copy changes, that constant changes
 * with it, and a tab left open across the change is refused rather than
 * recording agreement to text nobody saw.
 */
export function MandateDialog({
  open,
  amount,
  currency,
  intervalMonths,
  periodEnd,
  paymentMethod,
  onAccept,
  isPending,
  errorMessage,
  ...props
}: MandateDialogProps) {
  const t = useExtracted();
  const format = useFormatter();
  const isMobile = useIsMobile();
  const checkboxId = useId();

  // Local, and seeded false. Consent is given in this dialog or not at all;
  // there is no prop that could arrive pre-ticked.
  const [agreed, setAgreed] = useState(false);

  // Every open starts from an empty box, even if the customer ticked it,
  // thought better of it and closed the dialog. Reset on the *transition*
  // rather than in an effect, so the first render of a reopened dialog already
  // shows it clear - React's own "adjust state when a prop changes" pattern.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setAgreed(false);
  }

  const price = format.number(amount / 100, {
    style: "currency",
    currency,
  });

  const cadence =
    1 === intervalMonths
      ? t("{price} every month", { price })
      : t("{price} every {months} months", {
          price,
          months: format.number(intervalMonths),
        });

  const renewalDate = format.dateTime(periodEnd, {
    dateStyle: "long",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  // "visa" is the provider's own spelling; a sentence a customer is asked to
  // agree to should not read like a database column.
  const brand = paymentMethod?.brand;
  const card =
    paymentMethod?.last4 != null
      ? `${brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : t("Card")} •••• ${paymentMethod.last4}`
      : t("your saved payment method");

  return (
    <ResponsiveDialog
      title={t("Agree to automatic payments")}
      description={t(
        "Read and accept the terms under which Virtbase may charge your saved payment method.",
      )}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange?.(false)}
            disabled={isPending}
            autoFocus={!isMobile}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="button"
            data-testid="mandate-accept"
            onClick={() => onAccept(SUBSCRIPTION_MANDATE_TEXT_VERSION)}
            // Not merely styled as unavailable: without the tick there is
            // nothing to record.
            disabled={!agreed || isPending}
          >
            {isPending && <Spinner />}
            {t("Agree and turn on automatic renewal")}
          </Button>
        </>
      }
      open={open}
      {...props}
    >
      <div className="flex flex-col gap-4 text-sm" data-testid="mandate-text">
        <p>
          {t(
            "Virtbase will charge {cadence} to {card}, starting on {date} when your current term ends.",
            { cadence, card, date: renewalDate },
          )}
        </p>
        <p>
          {t(
            "This happens automatically. You will not be asked to approve each payment and you do not have to do anything for your server to keep running. If the price of your plan changes, we will tell you before the next payment.",
          )}
        </p>
        <p>
          {t(
            "You can turn automatic renewal off again at any time with the switch you just used, and you can end the subscription altogether with the “Cancel subscription” button on this page. Either way, your server keeps running until the end of the term you have already paid for.",
          )}
        </p>
        {errorMessage && (
          <Alert variant="destructive">
            <LucideTriangleAlert aria-hidden="true" />
            <AlertDescription>
              <p className="text-foreground">{errorMessage}</p>
            </AlertDescription>
          </Alert>
        )}
        <Label
          htmlFor={checkboxId}
          className="items-start gap-3 rounded-lg border p-4 font-normal"
        >
          <Checkbox
            id={checkboxId}
            data-testid="mandate-agree"
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(true === checked)}
            disabled={isPending}
            className="mt-0.5"
          />
          <span className="text-balance">
            {t(
              "I agree that Virtbase may charge {cadence} to my saved payment method, automatically and without asking again, until I turn this off or cancel.",
              { cadence },
            )}
          </span>
        </Label>
        <p className="text-muted-foreground text-xs">
          {t("Agreement version {version}", {
            version: SUBSCRIPTION_MANDATE_TEXT_VERSION,
          })}
        </p>
      </div>
    </ResponsiveDialog>
  );
}
