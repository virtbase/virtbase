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
 * A saved credential as the dashboard is allowed to see it.
 *
 * `provider` and `external_id` are absent by design and the output schema is
 * what enforces it: `external_id` is the token an off-session charge is made
 * against, so putting it on the wire would hand the browser half of a payment
 * credential. There is likewise no field for a pan, a cvc or an iban, and
 * adding one would take this application out of PCI SAQ-A.
 *
 * Session-only, like the abuse case surface: these procedures declare no
 * `openapi` metadata and no API key permissions, so the schemas are not part
 * of the public REST API.
 */
export const PaymentMethodSchema = z.object({
  id: z
    .string()
    .regex(/^pm_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the payment method.",
      examples: ["pm_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  type: z.string().meta({
    description: "The provider's label for the instrument.",
    examples: ["card", "sepa_debit"],
  }),
  brand: z
    .string()
    .nullable()
    .meta({
      description: "Card network or bank brand, when the provider reports one.",
      examples: ["visa"],
    }),
  last4: z
    .string()
    .nullable()
    .meta({
      // A string and not a number: the leading zeros in `0042` are part of it.
      description: "Last four digits of the instrument.",
      examples: ["4242"],
    }),
  exp_month: z.number().int().min(1).max(12).nullable(),
  exp_year: z.number().int().nullable(),
  is_default: z.boolean().meta({
    description: "Whether renewals charge this credential by default.",
  }),
  invalid_at: z.date().nullable().meta({
    description:
      "When the provider told us the credential is dead - expired, revoked, mandate cancelled.",
  }),
  invalid_reason: z.string().nullable(),
});

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const ListPaymentMethodsOutputSchema = z.object({
  payment_methods: z.array(PaymentMethodSchema),
});

/**
 * The client secret the browser confirms the setup against.
 *
 * Short-lived and scoped to one setup attempt, which is why it can be handed
 * to the browser at all - unlike the stored credential id it eventually
 * produces.
 */
export const CreatePaymentMethodSetupSessionOutputSchema = z.object({
  client_secret: z.string().min(1),
});

export const SetDefaultPaymentMethodInputSchema = z.object({
  id: PaymentMethodSchema.shape.id,
});

export const SetDefaultPaymentMethodOutputSchema = z.object({
  payment_method: PaymentMethodSchema,
});

export const RemovePaymentMethodInputSchema = z.object({
  id: PaymentMethodSchema.shape.id,
});

export const RemovePaymentMethodOutputSchema = z.void();
