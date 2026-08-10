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

/**
 * Tax rates for each EU member state.
 *
 * Last updated: 2026-04-14
 */
export const EU_VAT_RATES = {
  AT: 20.0,
  BE: 21.0,
  BG: 20.0,
  CY: 19.0,
  CZ: 21.0,
  DE: 19.0,
  DK: 25.0,
  EE: 24.0,
  ES: 21.0,
  FI: 25.5,
  FR: 20.0,
  HR: 25.0,
  HU: 27.0,
  IE: 23.0,
  IT: 22.0,
  LT: 21.0,
  LU: 17.0,
  LV: 21.0,
  MT: 18.0,
  NL: 21.0,
  PL: 23.0,
  PT: 23.0,
  RO: 21.0,
  SE: 25.0,
  SI: 22.0,
  SK: 23.0,
} as const;

export type InvoiceCountry = keyof typeof EU_VAT_RATES;

/** Languages an invoice can be written in. */
export type InvoiceLocale = "de" | "en" | "fr" | "nl";

const COUNTRY_LOCALE = {
  DE: "de",
  FR: "fr",
  NL: "nl",
} satisfies Partial<Record<InvoiceCountry, InvoiceLocale>>;

/**
 * The language a customer's invoice is written in, derived from where they are.
 *
 * A customer-facing decision rather than a provider one, which is why it lives
 * here and not in the accounting integration.
 */
export const mapCountryToInvoiceLocale = (
  country: InvoiceCountry,
): InvoiceLocale =>
  COUNTRY_LOCALE[country as keyof typeof COUNTRY_LOCALE] ?? "en";

/**
 * Label for a pro-rated upgrade line. Describes what was sold, so it belongs
 * with the order logic rather than with the invoice document's own copy.
 */
export const upgradeLineItemNames: Record<InvoiceLocale, string> = {
  en: "Upgrade to {name} (prorated)",
  de: "Upgrade auf {name} (anteilig)",
  nl: "Upgrade naar {name} (pro rata)",
  fr: "Mise à niveau vers {name} (au prorata)",
};
