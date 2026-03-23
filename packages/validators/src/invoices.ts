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

import type { SortableColumns } from "@virtbase/db/utils";
import * as z from "zod";
import { PaginationSchema } from "./pagination";
import { EXAMPLE_DATE, ObjectTimestampSchema, RFC3339LINK } from "./timestamps";
import { preprocessQueryArray } from "./utils";

const InvoiceSchema = z.object({
  id: z
    .string()
    .regex(/^inv_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the invoice.",
      examples: ["inv_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  // userId placeholder
  stripe_charge_id: z
    .string()
    .nullable()
    .meta({
      description: "The ID of the Stripe charge.",
      examples: ["ch_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  lexware_invoice_id: z.uuid().meta({
    description: "The UUID of the Lexware Office invoice.",
    examples: ["b2df5c0d-0340-42a7-9d47-cbc0a7460b8e"],
  }),
  number: z.string().meta({
    description: "The consecutive number of the invoice.",
    examples: ["RE-2026-0001"],
  }),
  total: z
    .number()
    .min(0)
    .meta({
      description: "Total gross amount of the invoice in cents.",
      examples: [119],
    }),
  tax_amount: z
    .number()
    .min(0)
    .meta({
      description: "Total tax amount of the invoice in cents.",
      examples: [19],
    }),
  reverse_charge: z.boolean().meta({
    description: "Whether the reverse charge applies to the invoice.",
    examples: [false],
  }),
  cancelled_at: z
    .date()
    .nullable()
    .meta({
      description: `The timestamp when the invoice was cancelled ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE],
    }),
  paid_at: z
    .date()
    .nullable()
    .meta({
      description: `The timestamp when the invoice was fully paid ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE],
    }),
  sent_at: z
    .date()
    .nullable()
    .meta({
      description: `The timestamp when the invoice was delivered to the customer ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE],
    }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type Invoice = z.infer<typeof InvoiceSchema>;

export const GetInvoiceInputSchema = z.object({ id: InvoiceSchema.shape.id });

export const GetInvoiceOutputSchema = z.object({
  invoice: InvoiceSchema.pick({
    id: true,
    number: true,
    total: true,
    tax_amount: true,
    reverse_charge: true,
    cancelled_at: true,
    paid_at: true,
    sent_at: true,
    created_at: true,
    updated_at: true,
  }),
});

export const DownloadInvoiceInputSchema = GetInvoiceInputSchema;

export const DownloadInvoiceOutputSchema = z.object({
  filename: z
    .string()
    .regex(/^.*\.pdf$/)
    .meta({
      description: "Original filename of the file.",
      examples: ["b2df5c0d-0340-42a7-9d47-cbc0a7460b8e.pdf"],
    }),
  content_type: z.literal("application/pdf").meta({
    description: "Content type of the file.",
    examples: ["application/pdf"],
  }),
  content: z.base64url().meta({
    description: "The base64url encoded file content.",
    examples: ["aHR0cHM6Ly9..."],
  }),
});

const sortSchema = z
  .enum<SortableColumns<Invoice>>([
    "id",
    "id:asc",
    "id:desc",
    "number",
    "number:asc",
    "number:desc",
    "total",
    "total:asc",
    "total:desc",
    "tax_amount",
    "tax_amount:asc",
    "tax_amount:desc",
    "paid_at",
    "paid_at:asc",
    "paid_at:desc",
    "created_at",
    "created_at:asc",
    "created_at:desc",
  ])
  .array()
  .default(["id:asc"]);

export const ListInvoicesInputSchema = z.object({
  // Required for trpc-to-openapi to work correctly
  sort: z.preprocess(
    preprocessQueryArray,
    sortSchema,
  ) as unknown as typeof sortSchema,
  number: InvoiceSchema.shape.number.nullish(),
  total: InvoiceSchema.shape.total.nullish(),
  tax_amount: InvoiceSchema.shape.tax_amount.nullish(),
  page: PaginationSchema.shape.page,
  per_page: PaginationSchema.shape.per_page,
});

export type ListInvoicesInput = z.infer<typeof ListInvoicesInputSchema>;

export const ListInvoicesOutputSchema = z.object({
  invoices: z.array(
    InvoiceSchema.pick({
      id: true,
      number: true,
      total: true,
      tax_amount: true,
      reverse_charge: true,
      cancelled_at: true,
      paid_at: true,
      sent_at: true,
      created_at: true,
      updated_at: true,
    }),
  ),
  meta: z.object({
    pagination: PaginationSchema,
  }),
});

export type ListInvoicesOutput = z.infer<typeof ListInvoicesOutputSchema>;
