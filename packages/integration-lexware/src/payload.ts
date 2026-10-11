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

import * as z from "zod";

/**
 * The invoice the adapter sends to `POST /invoices`: the subset of Lexware's
 * invoice resource this integration fills in
 * (https://developers.lexware.io/docs/#invoices-endpoint-create-an-invoice).
 * Line items carry gross unit prices in euros, because invoices are issued to
 * consumers under `taxType: "gross"`.
 */
export const InvoiceForCreateSchema = z.object({
  archived: z.boolean(),
  voucherDate: z.iso.datetime(),
  language: z.enum(["de", "en"]),
  address: z.object({
    contactId: z.string(),
    name: z.string(),
    supplement: z.string().optional(),
    street: z.string(),
    city: z.string(),
    zip: z.string(),
    countryCode: z.string(),
  }),
  lineItems: z
    .array(
      z.object({
        type: z.literal("custom"),
        name: z.string(),
        description: z.string().optional(),
        quantity: z.number(),
        unitName: z.string(),
        unitPrice: z.object({
          currency: z.literal("EUR"),
          grossAmount: z.number(),
          taxRatePercentage: z.number(),
        }),
        discountPercentage: z.number(),
      }),
    )
    .min(1),
  totalPrice: z.object({ currency: z.literal("EUR") }),
  taxConditions: z.object({
    taxType: z.literal("gross"),
    taxSubType: z.literal("electronicServices").optional(),
  }),
  shippingConditions: z.object({
    shippingType: z.literal("service"),
    shippingDate: z.iso.datetime(),
  }),
  title: z.string(),
  introduction: z.string(),
  remark: z.string(),
  paymentConditions: z.object({
    paymentTermDuration: z.number().int(),
    paymentTermLabel: z.string(),
  }),
});

export type InvoiceForCreate = z.output<typeof InvoiceForCreateSchema>;
