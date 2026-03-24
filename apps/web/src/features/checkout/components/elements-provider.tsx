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
import type { PropsWithChildren } from "react";

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
  return (
    <Elements
      stripe={stripePromise}
      options={{
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
            colorPrimary: "#e5e5e5",
            colorBackground: "#0a0a0a",
            colorDanger: "#ff6467",
            colorText: "#fafafa",
            colorTextSecondary: "#a1a1a1",
            borderRadius: "0.625rem",
            colorTextPlaceholder: "#a1a1a1",
            iconColor: "#a1a1a1",
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
              backgroundColor: "#ffffff0b",
            },
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}
