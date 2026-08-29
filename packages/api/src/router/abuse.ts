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

import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "@virtbase/db";
import {
  abuseCaseMessages,
  abuseCaseServers,
  abuseCases,
  servers,
} from "@virtbase/db/schema";
import {
  GetAbuseCaseInputSchema,
  GetAbuseCaseOutputSchema,
  ListAbuseCasesInputSchema,
  ListAbuseCasesOutputSchema,
  MarkAbuseCaseMitigatedInputSchema,
  ReplyToAbuseCaseInputSchema,
} from "@virtbase/validators";
import { caseReference, recordCaseEvent, sanitizeAbuseBody } from "../abuse";
import { dispatchNotification } from "../notifications/dispatch";
import { protectedProcedure } from "../trpc";

/**
 * A case a customer may still act on.
 *
 * `resolved` and `rejected` are readable but closed: reopening a settled case
 * is an operator's decision, and letting a reply do it silently would mean the
 * audit trail no longer describes what happened.
 */
const OPEN_TO_CUSTOMER = [
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
  "mitigated",
] as const;

type Database = Parameters<
  Parameters<typeof protectedProcedure.query>[0]
>[0]["ctx"]["db"];

const loadOwnCase = async (db: Database, caseId: string, userId: string) => {
  const row = await db
    .select({
      id: abuseCases.id,
      number: abuseCases.number,
      status: abuseCases.status,
      respondBy: abuseCases.respondBy,
    })
    .from(abuseCases)
    .where(
      and(
        eq(abuseCases.id, caseId),
        // [!] Authorization: only ever the caller's own cases
        eq(abuseCases.userId, userId),
      ),
    )
    .limit(1)
    .then(([first]) => first);

  if (!row) throw new TRPCError({ code: "NOT_FOUND" });

  return row;
};

/**
 * The customer's side of an abuse case.
 *
 * Session-only: no `openapi` metadata and no API key permissions, so a key is
 * refused by the auth middleware. Answering an accusation is a thing a person
 * does, and a bearer credential has nobody behind it at request time - the
 * same reasoning `stepUpProcedure` already makes for account deletion.
 */
export const abuseRouter = {
  list: protectedProcedure
    .input(ListAbuseCasesInputSchema)
    .output(ListAbuseCasesOutputSchema)
    .query(async ({ ctx }) => {
      const { db, userId } = ctx;

      const rows = await db.transaction(
        async (tx) =>
          tx
            .select({
              id: abuseCases.id,
              number: abuseCases.number,
              category: abuseCases.category,
              severity: abuseCases.severity,
              status: abuseCases.status,
              title: abuseCases.title,
              respond_by: abuseCases.respondBy,
              created_at: abuseCases.createdAt,
              updated_at: abuseCases.updatedAt,
            })
            .from(abuseCases)
            // [!] Authorization: only ever the caller's own cases
            .where(eq(abuseCases.userId, userId))
            .orderBy(desc(abuseCases.createdAt)),
        { accessMode: "read only", isolationLevel: "read committed" },
      );

      return {
        cases: rows.map(({ number, ...row }) => ({
          ...row,
          reference: caseReference(number),
        })),
      };
    }),

  get: protectedProcedure
    .input(GetAbuseCaseInputSchema)
    .output(GetAbuseCaseOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      return db.transaction(
        async (tx) => {
          const row = await tx
            .select({
              id: abuseCases.id,
              number: abuseCases.number,
              category: abuseCases.category,
              severity: abuseCases.severity,
              status: abuseCases.status,
              title: abuseCases.title,
              summary: abuseCases.summary,
              respond_by: abuseCases.respondBy,
              created_at: abuseCases.createdAt,
              updated_at: abuseCases.updatedAt,
            })
            .from(abuseCases)
            .where(
              and(
                eq(abuseCases.id, input.id),
                // [!] Authorization: only ever the caller's own cases
                eq(abuseCases.userId, userId),
              ),
            )
            .limit(1)
            .then(([first]) => first);

          if (!row) throw new TRPCError({ code: "NOT_FOUND" });

          const affected = await tx
            .select({
              server_id: abuseCaseServers.serverId,
              server_name: servers.name,
              lock_level: abuseCaseServers.lockLevel,
              locked_at: abuseCaseServers.lockedAt,
              released_at: abuseCaseServers.releasedAt,
            })
            .from(abuseCaseServers)
            .innerJoin(servers, eq(servers.id, abuseCaseServers.serverId))
            .where(eq(abuseCaseServers.caseId, row.id));

          const messages = await tx
            .select({
              id: abuseCaseMessages.id,
              author: abuseCaseMessages.authorKind,
              body: abuseCaseMessages.body,
              created_at: abuseCaseMessages.createdAt,
            })
            .from(abuseCaseMessages)
            .where(
              and(
                eq(abuseCaseMessages.caseId, row.id),
                // [!] Internal notes are operators talking to each other.
                eq(abuseCaseMessages.audience, "customer"),
              ),
            )
            .orderBy(asc(abuseCaseMessages.createdAt));

          const { number, ...abuseCase } = row;

          return {
            case: {
              ...abuseCase,
              reference: caseReference(number),
              servers: affected,
              // A reporter's own words carry their identity; the customer is
              // told what they are accused of through the case summary.
              messages: messages.filter(
                (message) => "reporter" !== message.author,
              ) as {
                id: string;
                author: "customer" | "operator" | "system";
                body: string;
                created_at: Date;
              }[],
            },
          };
        },
        { accessMode: "read only", isolationLevel: "read committed" },
      );
    }),

  reply: protectedProcedure
    .input(ReplyToAbuseCaseInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const abuseCase = await loadOwnCase(db, input.id, userId);

      if (!OPEN_TO_CUSTOMER.includes(abuseCase.status as never)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This case is closed. Contact support to reopen it.",
        });
      }

      const body = sanitizeAbuseBody(input.body);
      if (!body) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Write something before sending.",
        });
      }

      await db.insert(abuseCaseMessages).values({
        caseId: abuseCase.id,
        authorKind: "customer",
        authorUserId: userId,
        audience: "customer",
        body,
      });

      // The clock is for the customer's answer, so answering stops it.
      if ("awaiting_customer" === abuseCase.status) {
        await db
          .update(abuseCases)
          .set({ status: "awaiting_operator", respondBy: null })
          .where(eq(abuseCases.id, abuseCase.id));
      }

      await recordCaseEvent({
        db,
        caseId: abuseCase.id,
        type: "customer.replied",
        actorKind: "customer",
        actorUserId: userId,
        fromValue: abuseCase.status,
        toValue:
          "awaiting_customer" === abuseCase.status
            ? "awaiting_operator"
            : abuseCase.status,
      });

      await dispatchNotification({
        key: "abuse.case.customer_replied",
        audience: { kind: "operator" },
        severity: "warning",
        groupKey: `abuse:${abuseCase.id}`,
        url: `/abuse/${abuseCase.id}`,
        params: {
          reference: caseReference(abuseCase.number),
          title: `${caseReference(abuseCase.number)}: the customer replied`,
          body,
        },
      }).catch(() => undefined);

      return { ok: true as const };
    }),

  markMitigated: protectedProcedure
    .input(MarkAbuseCaseMitigatedInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const abuseCase = await loadOwnCase(db, input.id, userId);

      if (!OPEN_TO_CUSTOMER.includes(abuseCase.status as never)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This case is closed. Contact support to reopen it.",
        });
      }

      const note = sanitizeAbuseBody(input.note ?? null);

      await db.insert(abuseCaseMessages).values({
        caseId: abuseCase.id,
        authorKind: "customer",
        authorUserId: userId,
        audience: "customer",
        body: note ?? "The customer reports that this has been fixed.",
      });

      // Not `mitigated`: that is the operator accepting the claim, and a
      // customer marking their own case fixed would otherwise release whatever
      // was holding the abuse back.
      await db
        .update(abuseCases)
        .set({ status: "awaiting_operator", respondBy: null })
        .where(eq(abuseCases.id, abuseCase.id));

      await recordCaseEvent({
        db,
        caseId: abuseCase.id,
        type: "customer.claims_fixed",
        actorKind: "customer",
        actorUserId: userId,
        fromValue: abuseCase.status,
        toValue: "awaiting_operator",
      });

      await dispatchNotification({
        key: "abuse.case.customer_replied",
        audience: { kind: "operator" },
        severity: "warning",
        groupKey: `abuse:${abuseCase.id}`,
        url: `/abuse/${abuseCase.id}`,
        params: {
          reference: caseReference(abuseCase.number),
          title: `${caseReference(abuseCase.number)}: the customer says it is fixed`,
          body: note ?? "",
        },
      }).catch(() => undefined);

      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
