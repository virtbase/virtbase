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
 * The mapping of collective contacts for each country.
 *
 * This will be used to generate invoices for private customers according to the OSS (One-Stop-Shop) rules.
 *
 * Since we don't want to create a new contact for each customer, we will use these collective contacts
 * for each respective country.
 */
export const LEXWARE_COUNTRY_CONTACTS = {
  AT: "cd3f8aae-d528-489c-9bac-01fdcfb39ce4",
  BE: "9dbf4539-97ca-4714-97da-a8286f0f9527",
  BG: "f3b5425b-5cdb-44ec-9a84-92dbf18ffb40",
  CY: "61313c89-72e6-401c-a53e-861b871ecd5b",
  CZ: "278856cb-ed64-4ea1-b305-a767bb9ff110",
  DE: "143f1583-6c6f-450e-82ba-ee98907b8d3e",
  DK: "37f2c27c-5fdf-498d-b9e3-8976c0ce6f92",
  EE: "bb405226-37a9-44da-94dd-25bd303c2ba5",
  ES: "035e2dcf-e3f5-442e-9961-b811adbaef34",
  FI: "b838a4e4-71b4-4ea0-b548-26b90dbe4310",
  FR: "1f17df67-fed3-462e-a18a-96726cf17942",
  HR: "d73cb761-9d9a-4a46-9bf6-1d1d498a2728",
  HU: "0c939e65-5467-41f2-8489-1a7c6b6f2d19",
  IE: "03c1c41e-1c81-416e-9110-3c121222bb97",
  IT: "767b7f2b-c479-4f47-b8f3-dba4feaf0236",
  LT: "2e69718f-3346-4183-a8f1-1531c28a8e9f",
  LU: "e88e8e94-2568-4cb8-becd-9eda2f9773d3",
  LV: "02d8646f-d88e-4536-9295-aa88ea5e1110",
  MT: "e8b900be-34d9-4dfc-9b47-b9896466a583",
  NL: "5c841436-79c6-4122-b746-eee6d32d52bd",
  PL: "dd309f6c-2c84-4430-b330-3497ff63c806",
  PT: "ae73099b-7242-4980-acb0-de002b5ebfba",
  RO: "0df93bcb-7db7-4001-8cee-355086892f4c",
  SE: "3d1b1e87-78a5-4a4b-b83d-f79bffccef84",
  SI: "aa620030-1312-4f18-adce-26c3932f9702",
  SK: "7dadc745-d8c8-4d57-89c3-310899493b44",
} as const;

/**
 * Tax rates for each EU member state.
 *
 * Last updated: 2025-11-21
 */
export const LEXWARE_COUNTRY_TAX_RATES = {
  AT: 20.0,
  BE: 21.0,
  BG: 20.0,
  CY: 19.0,
  CZ: 21.0,
  DE: 19.0,
  DK: 25.0,
  EE: 20.0,
  ES: 21.0,
  FI: 24.0,
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
  RO: 20.0,
  SE: 25.0,
  SI: 22.0,
  SK: 20.0,
} as const;

export type LexwareCountry = keyof typeof LEXWARE_COUNTRY_TAX_RATES;

/**
 * The home country of the company.
 *
 * This will be used to determine:
 * 1) The normal tax rate for invoices in the home country.
 * 2) When to apply the reverse charge for business customers that are not from the home country.
 */
export const LEXWARE_HOME_COUNTRY = "DE" as const;
