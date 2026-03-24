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
import { Button } from "@virtbase/ui/button";
import { LucideShoppingCart } from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { PUBLIC_DOMAIN } from "@virtbase/utils";
import { useExtracted, useLocale } from "next-intl";
import type { FormEvent } from "react";
import { useCallback, useState } from "react";

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

export function StripePaymentForm() {
  const stripe = useStripe();
  const elements = useElements();
  const locale = useLocale();

  const t = useExtracted();

  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setIsPending(true);

      if (!stripe || !elements) {
        return;
      }

      const { error } = await stripe.confirmPayment({
        confirmParams: {
          return_url: `${PUBLIC_DOMAIN}/${locale}/checkout/return`,
        },
        redirect: "always",
        elements,
      });

      if (error?.message) {
        setError(error.message);
        setIsPending(false);
      }
    },
    [stripe, elements, locale],
  );

  return (
    <form id="checkout-form" className="space-y-4" onSubmit={handleSubmit}>
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
      <PaymentElement
        options={{
          business: {
            name: "Virtbase",
          },
          layout: {
            type: "accordion",
            spacedAccordionItems: true,
            defaultCollapsed: false,
            radios: true,
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
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="mt-6 flex justify-end">
        <Button type="submit" form="checkout-form" disabled={isPending}>
          {isPending ? <Spinner /> : <LucideShoppingCart aria-hidden="true" />}
          {t("Buy now")}
        </Button>
      </div>
    </form>
  );
}
