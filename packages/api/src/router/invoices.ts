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

import * as Sentry from "@sentry/node";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "@virtbase/db";
import { invoices } from "@virtbase/db/schema";
import { buildOrderBy } from "@virtbase/db/utils";
import {
  DownloadInvoiceInputSchema,
  DownloadInvoiceOutputSchema,
  GetInvoiceInputSchema,
  GetInvoiceOutputSchema,
  getPaginationMeta,
  ListInvoicesInputSchema,
  ListInvoicesOutputSchema,
} from "@virtbase/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const invoicesRouter = createTRPCRouter({
  get: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/invoices/{id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Invoices"],
        summary: "Get an invoice",
        description: "Returns a specific invoice by its unique identifier.",
      },
    })
    .input(GetInvoiceInputSchema)
    .output(GetInvoiceOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const invoice = await db.transaction(
        async (tx) => {
          return tx
            .select({
              id: invoices.id,
              number: invoices.number,
              total: invoices.total,
              tax_amount: invoices.taxAmount,
              reverse_charge: invoices.reverseCharge,
              cancelled_at: invoices.cancelledAt,
              paid_at: invoices.paidAt,
              sent_at: invoices.sentAt,
              created_at: invoices.createdAt,
              updated_at: invoices.updatedAt,
            })
            .from(invoices)
            .where(
              and(
                eq(invoices.id, input.id),
                // [!] Authorization: Only allow the user to access their own invoices
                eq(invoices.userId, userId),
              ),
            )
            .limit(1)
            .then(([row]) => row);
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      if (!invoice) {
        throw new TRPCError({
          code: "NOT_FOUND",
        });
      }

      return { invoice };
    }),
  download: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/invoices/{id}/download",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Invoices"],
        summary: "Download an invoice",
        description: "Downloads a specific invoice by its unique identifier.",
      },
      ratelimit: {
        requests: 4,
        seconds: "1 m",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `download-invoice:${userId || defaultFingerprint}`,
      },
    })
    .input(DownloadInvoiceInputSchema)
    .output(DownloadInvoiceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, lexware, userId } = ctx;

      const invoice = await db.transaction(
        async (tx) => {
          return tx
            .select({
              lexwareInvoiceId: invoices.lexwareInvoiceId,
            })
            .from(invoices)
            .where(
              and(
                eq(invoices.id, input.id),
                // [!] Authorization: Only allow the user to access their own invoices
                eq(invoices.userId, userId),
              ),
            )
            .limit(1)
            .then(([row]) => row);
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      if (!invoice) {
        throw new TRPCError({
          code: "NOT_FOUND",
        });
      }

      if (!lexware) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      try {
        const arrayBuffer = await lexware.downloadInvoice(
          invoice.lexwareInvoiceId,
        );

        return {
          filename: `${invoice.lexwareInvoiceId}.pdf`,
          content_type: "application/pdf",
          content: Buffer.from(arrayBuffer).toString("base64url"),
        };
      } catch (error) {
        Sentry.captureException(error);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/invoices",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Invoices"],
        summary: "List invoices",
        description: "Returns a list of invoices for the current user.",
      },
    })
    .input(ListInvoicesInputSchema)
    .output(ListInvoicesOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const { page, per_page: perPage } = input;

      const where = and(
        // [!] Authorization: Only allow the user to access their own invoices
        eq(invoices.userId, userId),
        // Filters
        input.number ? eq(invoices.number, input.number) : undefined,
        input.total ? eq(invoices.total, input.total) : undefined,
        input.tax_amount ? eq(invoices.taxAmount, input.tax_amount) : undefined,
      );

      const orderBy = buildOrderBy(invoices, input.sort, invoices.id);

      const offset = (page - 1) * perPage;

      const { data, total } = await db.transaction(
        async (tx) => {
          const data = await tx
            .select({
              id: invoices.id,
              number: invoices.number,
              total: invoices.total,
              tax_amount: invoices.taxAmount,
              reverse_charge: invoices.reverseCharge,
              cancelled_at: invoices.cancelledAt,
              paid_at: invoices.paidAt,
              sent_at: invoices.sentAt,
              created_at: invoices.createdAt,
              updated_at: invoices.updatedAt,
            })
            .from(invoices)
            .limit(perPage)
            .offset(offset)
            .where(where)
            .orderBy(...orderBy);

          const total = await tx
            .select({ count: count() })
            .from(invoices)
            .where(where)
            .execute()
            .then(([res]) => res?.count ?? 0);

          return { data, total };
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      return {
        invoices: data.map((item) => ({
          id: item.id,
          number: item.number,
          total: item.total,
          tax_amount: item.tax_amount,
          reverse_charge: item.reverse_charge,
          cancelled_at: item.cancelled_at,
          paid_at: item.paid_at,
          sent_at: item.sent_at,
          created_at: item.created_at,
          updated_at: item.updated_at,
        })),
        meta: {
          pagination: getPaginationMeta({
            total,
            page,
            perPage,
          }),
        },
      };
    }),
});
