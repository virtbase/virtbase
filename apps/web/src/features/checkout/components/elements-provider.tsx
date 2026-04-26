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

import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  ANONPAY_MIN_AMOUNT,
  ANONPAY_STRIPE_METHOD_ID,
} from "@virtbase/api/anonpay/constants";
import { useTheme } from "@virtbase/ui/theme-provider";
import { useExtracted } from "next-intl";
import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
);

export function ElementsProvider({
  children,
  customerSessionClientSecret,
  clientSecret,
}: PropsWithChildren<{
  customerSessionClientSecret: string;
  clientSecret: string;
}>) {
  const t = useExtracted();
  const { resolvedTheme: theme } = useTheme();

  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stripe = await stripePromise;
        if (!stripe) {
          if (!cancelled) setAmount(0);
          return;
        }
        const { paymentIntent } =
          await stripe.retrievePaymentIntent(clientSecret);
        if (cancelled) return;
        setAmount(paymentIntent?.amount ?? 0);
      } catch {
        if (!cancelled) setAmount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientSecret]);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        ...(ANONPAY_STRIPE_METHOD_ID &&
        amount !== null &&
        amount >= ANONPAY_MIN_AMOUNT
          ? {
              customPaymentMethods: [
                {
                  id: ANONPAY_STRIPE_METHOD_ID,
                  options: {
                    type: "static",
                    subtitle: t("Pay anonymously with cryptocurrency"),
                  },
                },
              ],
            }
          : {}),
        customerSessionClientSecret,
        clientSecret,
        fonts: [
          {
            cssSrc:
              "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap",
          },
        ],
        appearance: {
          inputs: "spaced",
          labels: "above",
          variables: {
            colorPrimary: theme === "dark" ? "#e5e5e5" : "#171717",
            colorBackground: theme === "dark" ? "#0a0a0a" : "#ffffff",
            colorDanger: theme === "dark" ? "#ff6467" : "#e7000b",
            colorText: theme === "dark" ? "#fafafa" : "#0a0a0a",
            colorTextSecondary: theme === "dark" ? "#a1a1a1" : "#737373",
            borderRadius: "0.625rem",
            colorTextPlaceholder: theme === "dark" ? "#a1a1a1" : "#737373",
            iconColor: theme === "dark" ? "#a1a1a1" : "#737373",
            gridColumnSpacing: "20px",
            fontFamily: "Geist, sans-serif",
            fontSizeBase: "16px",
            fontSizeSm: "14px",
            //fontSizeXs: "12px",
            fontSizeLg: "18px",
            fontSizeXl: "20px",
            fontWeightBold: "700",
            fontWeightNormal: "400",
            fontWeightLight: "300",
            fontWeightMedium: "500",
          },
          rules: {
            ".Label": {
              marginBottom: "8px",
            },
            ".Input": {
              backgroundColor: theme === "dark" ? "#ffffff0b" : "transparent",
            },
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}
