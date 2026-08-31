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
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { Button } from "@virtbase/ui/button";
import { FieldDescription, FieldSet } from "@virtbase/ui/field";
import { LucideShieldCheck, LucideTriangleAlert } from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import type { FormEvent } from "react";
import { useCallback, useState } from "react";

/**
 * How a confirmation ended, once it has ended.
 *
 * `processing` is a success: a SEPA mandate is not accepted the moment the
 * form is submitted, and telling the customer it failed because it is not
 * finished yet would have them enter it a second time.
 */
export type SetupOutcome = "saved" | "processing";

/**
 * Collects a credential and confirms it with the provider.
 *
 * Mounted inside the checkout's `ElementsProvider` - the same `loadStripe`
 * instance, the same appearance, the same fonts - so the card form here and
 * the one at checkout are one integration rather than two that drift.
 *
 * **The authentication step is an outcome, not an error.** The SetupIntent is
 * created with `usage: "off_session"`, which is exactly the case where an
 * issuer asks the customer to authenticate now so that a renewal months from
 * now does not have to. `redirect: "if_required"` lets Stripe run that
 * challenge in its own overlay and resolve once the customer is through it, so
 * the normal path never leaves this page; only a method that can be confirmed
 * no other way redirects, which is what `return_url` is for. Either way the
 * wait is longer than a form submit, so the button says what is happening
 * instead of looking stuck.
 *
 * Rendered in a panel rather than a dialog. `AddPaymentMethod` carries the
 * reasons, which are specific to Radix's modal `DialogContent` and were
 * checked against its source rather than assumed.
 */
export function AddPaymentMethodForm({
  returnUrl,
  onSaved,
  onCancel,
}: {
  /** Where a provider that can only redirect sends the customer back to. */
  returnUrl: string;
  onSaved: (outcome: SetupOutcome) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const t = useExtracted();

  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const isReady = Boolean(stripe && elements);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (!stripe || !elements) return;

      const { error: submitError } = await elements.submit();
      if (submitError) {
        // Elements has already marked the offending field. Repeating it above
        // the form only moves the customer's eyes away from the fix.
        setError(
          submitError.type === "validation_error"
            ? null
            : (submitError.message ??
                t("Your card details could not be checked. Try again.")),
        );
        return;
      }

      setError(null);
      setIsPending(true);

      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: returnUrl },
        // Runs the issuer's authentication in Stripe's own overlay and comes
        // back here. Only a method that cannot be confirmed in place leaves
        // for `return_url`.
        redirect: "if_required",
      });

      setIsPending(false);

      if (confirmError) {
        setError(
          confirmError.type === "validation_error"
            ? null
            : (confirmError.message ??
                t(
                  "Your bank did not approve this card. Check the details, or try a different card.",
                )),
        );
        return;
      }

      switch (setupIntent?.status) {
        case "succeeded":
          onSaved("saved");
          return;
        case "processing":
          // The mandate is with the bank. Nothing more for the customer to do.
          onSaved("processing");
          return;
        case "requires_action":
          setError(
            t(
              "Your bank still has to confirm this card. Finish the check it sent you, then add the card again.",
            ),
          );
          return;
        default:
          setError(
            t(
              "The card was not saved and nothing was charged. Check the details, or try a different card.",
            ),
          );
      }
    },
    [stripe, elements, returnUrl, onSaved, t],
  );

  return (
    <form
      id="add-payment-method-form"
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-4"
    >
      {/* One disabled fieldset switches off every embedded Stripe control at
          once, so nothing can be edited while the bank is being asked. */}
      <FieldSet disabled={isPending} className="gap-3">
        {/* The panel above supplies the heading, the way a dialog title does. */}
        <FieldDescription className="flex items-center gap-1.5">
          <LucideShieldCheck
            className="size-3.5 shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {t("We only ever see the brand and the last four digits.")}
        </FieldDescription>
        <PaymentElement
          options={{
            business: { name: "Virtbase" },
            layout: {
              type: "accordion",
              spacedAccordionItems: true,
              defaultCollapsed: false,
              radios: "auto",
            },
            terms: { card: "always", sepaDebit: "always" },
            wallets: { link: "never" },
          }}
        />
      </FieldSet>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="empty:hidden"
      >
        {error && (
          <Alert variant="destructive" data-testid="add-payment-method-error">
            <LucideTriangleAlert aria-hidden="true" />
            <AlertTitle className="line-clamp-none">
              {t("The card was not saved")}
            </AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* `DialogFooter`'s own shape: reversed on a phone so the primary
          action is the one under the thumb, right-aligned above it. */}
      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          {t("Cancel")}
        </Button>
        <Button
          type="submit"
          disabled={isPending || !isReady}
          aria-busy={isPending}
        >
          {isPending && <Spinner />}
          {isPending ? t("Confirming with your bank…") : t("Save card")}
        </Button>
      </div>
    </form>
  );
}
