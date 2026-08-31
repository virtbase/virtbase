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

import {
  AddressElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { ANONPAY_STRIPE_METHOD_ID } from "@virtbase/integration-anonpay";
import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { Button } from "@virtbase/ui/button";
import { FieldDescription, FieldSet, FieldTitle } from "@virtbase/ui/field";
import {
  LucideLock,
  LucideShieldCheck,
  LucideTriangleAlert,
} from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { PUBLIC_DOMAIN } from "@virtbase/utils";
import { useExtracted, useLocale } from "next-intl";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PAYMENT_FORM_ID } from "../constants";
import { useCustomCheckout } from "../hooks/use-custom-checkout";

export const countries = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
];

export function StripePaymentForm({
  orderId,
  onProcessingChange,
  onReadyChange,
  hideActions = false,
}: {
  orderId: string | null;
  /**
   * Fires `true` when `stripe.confirmPayment` starts and `false` once it
   * resolves (or the component unmounts). Lets sibling UI — e.g. a
   * "Change plan" back button — disable itself while the user is mid-
   * payment so the session can't be pulled out from under them.
   */
  onProcessingChange?: (isProcessing: boolean) => void;
  /**
   * Fires when Stripe.js and Elements have finished loading. A caller that
   * renders the submit button itself needs this, or it shows an enabled button
   * whose press `handleSubmit` drops on the floor.
   */
  onReadyChange?: (isReady: boolean) => void;
  /**
   * Leaves the action row off, for a caller that renders the buttons in a
   * dialog footer instead - see {@link PAYMENT_FORM_ID}. The form still owns
   * submission; only the controls move.
   */
  hideActions?: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const locale = useLocale();

  const t = useExtracted();

  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  /**
   * Bring the error into view whenever it changes so the user never misses
   * a failed payment attempt — especially on mobile where the Payment
   * Element pushes the CTA far below the fold.
   */
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [error]);

  // Keep the processing callback in a ref so `handleSubmit` stays stable
  // even if the caller passes a fresh function each render, and so an
  // unmount during payment still flushes a clean `false`.
  const onProcessingChangeRef = useRef(onProcessingChange);
  useEffect(() => {
    onProcessingChangeRef.current = onProcessingChange;
  }, [onProcessingChange]);

  useEffect(() => {
    return () => {
      onProcessingChangeRef.current?.(false);
    };
  }, []);

  const {
    mutateAsync: createCustomCheckout,
    isPending: isCustomCheckoutPending,
  } = useCustomCheckout({
    mutationConfig: {
      onError: (error) => {
        setError(error.message);
        setIsPending(false);
        onProcessingChangeRef.current?.(false);
      },
    },
  });

  const isReady = Boolean(stripe && elements);
  const isSubmitDisabled = isPending || isCustomCheckoutPending || !isReady;

  const onReadyChangeRef = useRef(onReadyChange);
  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    onReadyChangeRef.current?.(isReady);
  }, [isReady]);

  // Flushed on unmount as well, or a caller that leaves the payment step and
  // comes back keeps a submit button enabled over an Elements tree that has
  // not loaded yet.
  useEffect(() => {
    return () => {
      onReadyChangeRef.current?.(false);
    };
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (!stripe || !elements) return;

      const { selectedPaymentMethod, error: submitError } =
        await elements.submit();
      if (!selectedPaymentMethod) {
        setError(submitError?.message ?? null);
        return;
      }

      setError(null);
      setIsPending(true);
      onProcessingChangeRef.current?.(true);

      if (
        ANONPAY_STRIPE_METHOD_ID &&
        selectedPaymentMethod === ANONPAY_STRIPE_METHOD_ID &&
        orderId
      ) {
        const addressElement = elements.getElement("address");

        const addressState = await addressElement?.getValue();
        if (!addressState?.complete) {
          setError(t("Please fill in all fields of the billing address."));
          setIsPending(false);
          onProcessingChangeRef.current?.(false);
          return;
        }

        return createCustomCheckout({
          order_id: orderId,
          type: "anonpay",
          billing_details: addressState.value,
        });
      }

      const { error } = await stripe.confirmPayment({
        confirmParams: {
          return_url: `${PUBLIC_DOMAIN}/${locale}/checkout/return`,
        },
        redirect: "always",
        elements,
      });

      // If we reach this point Stripe did not redirect — confirmPayment
      // either failed client-side validation or the PI could not be
      // confirmed. Surface the error and re-enable the form.
      if (error?.message) {
        setError(error.message);
      }
      setIsPending(false);
      onProcessingChangeRef.current?.(false);
    },
    [stripe, elements, locale, orderId, createCustomCheckout, t],
  );

  return (
    <form id={PAYMENT_FORM_ID} onSubmit={handleSubmit} className="space-y-6">
      {/**
       * A single <fieldset disabled> disables every embedded Stripe iframe
       * control in one go, preventing partial edits during confirmPayment.
       */}

      <FieldSet disabled={isPending}>
        <section className="space-y-3">
          <header className="flex flex-col gap-0.5">
            <FieldTitle>{t("Billing address")}</FieldTitle>
            <FieldDescription>
              {t("Used for invoicing and VAT calculation.")}
            </FieldDescription>
          </header>
          <AddressElement
            options={{
              mode: "billing",
              allowedCountries: countries,
              blockPoBox: true,
              autocomplete: {
                mode: "automatic",
              },
            }}
          />
        </section>

        <section className="space-y-3">
          <header className="flex flex-col gap-0.5">
            <FieldTitle>{t("Payment method")}</FieldTitle>
            <FieldDescription className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <LucideShieldCheck
                className="size-3.5 shrink-0"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {t("Payments are securely processed by Stripe.")}
            </FieldDescription>
          </header>
          <PaymentElement
            options={{
              business: {
                name: "Virtbase",
              },
              layout: {
                type: "accordion",
                spacedAccordionItems: true,
                defaultCollapsed: false,
                radios: "auto",
              },
              terms: {
                card: "always",
                sepaDebit: "always",
              },
              wallets: {
                link: "never",
              },
            }}
          />
        </section>
      </FieldSet>

      <div
        ref={errorRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="empty:hidden"
      >
        {error && (
          <Alert variant="destructive">
            <LucideTriangleAlert aria-hidden="true" />
            <AlertTitle>{t("Payment could not be completed")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {!hideActions && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="submit"
            form={PAYMENT_FORM_ID}
            disabled={isSubmitDisabled}
            aria-busy={isPending}
          >
            {isPending ? (
              <Spinner />
            ) : (
              <LucideLock aria-hidden="true" strokeWidth={1.75} />
            )}
            {isPending ? t("Processing payment…") : t("Pay now")}
          </Button>
        </div>
      )}
    </form>
  );
}
