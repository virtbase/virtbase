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

"use server";

import { TRPCError } from "@trpc/server";
import {
  caseReference,
  enforceCase,
  notifyReportersResolved,
  recordCaseEvent,
  releaseCase,
  sanitizeAbuseBody,
  sendToReporters,
  setCaseStatus,
} from "@virtbase/api/abuse";
import { dispatchNotification } from "@virtbase/api/notifications";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { abuseCaseMessages, abuseCases, users } from "@virtbase/db/schema";
import {
  AbuseCaseResolutionSchema,
  AbuseCaseSeveritySchema,
  AbuseCategorySchema,
} from "@virtbase/validators";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { actionClient } from "../../lib/action-client";

const revalidate = () => revalidatePath("/admin.virtbase.com");

const loadCase = async (caseId: string) => {
  const row = await db
    .select({
      id: abuseCases.id,
      number: abuseCases.number,
      status: abuseCases.status,
      userId: abuseCases.userId,
    })
    .from(abuseCases)
    .where(eq(abuseCases.id, caseId))
    .limit(1)
    .then(([first]) => first);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Unknown case." });
  }

  return row;
};

/**
 * Opens a case by hand.
 *
 * Takes the same path as an automatic one - a case row, an audit trail, the
 * same notification keys - so a hand-made case is not a second kind of case
 * that behaves differently three months later.
 */
export const createAbuseCaseAction = actionClient
  .inputSchema(
    z.object({
      /** The customer's address. Operators have that, not a user id. */
      email: z.email(),
      category: AbuseCategorySchema,
      severity: AbuseCaseSeveritySchema,
      title: z.string().min(1).max(500),
      summary: z.string().max(20_000).optional(),
      notifyCustomer: z.boolean(),
      responseHours: z.number().int().min(1).max(720),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const customer = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsedInput.email))
      .limit(1)
      .then(([first]) => first);

    if (!customer) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `No account with the address ${parsedInput.email}.`,
      });
    }

    const [created] = await db
      .insert(abuseCases)
      .values({
        userId: customer.id,
        category: parsedInput.category,
        severity: parsedInput.severity,
        // An operator opening a case has already done the triage.
        status: parsedInput.notifyCustomer ? "awaiting_customer" : "open",
        title: parsedInput.title,
        summary: sanitizeAbuseBody(parsedInput.summary ?? null),
        openedBy: ctx.user.id,
        ...(parsedInput.notifyCustomer
          ? {
              respondBy: new Date(
                Date.now() + parsedInput.responseHours * 3_600_000,
              ),
            }
          : {}),
      })
      .returning({ id: abuseCases.id, number: abuseCases.number });

    if (!created) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "The case could not be opened.",
      });
    }

    await recordCaseEvent({
      db,
      caseId: created.id,
      type: "case.opened",
      actorKind: "operator",
      actorUserId: ctx.user.id,
      toValue: parsedInput.notifyCustomer ? "awaiting_customer" : "open",
      metadata: { manual: true },
    });

    if (parsedInput.notifyCustomer) {
      await dispatchNotification({
        key: "abuse.case.notice",
        audience: { kind: "user", userId: customer.id },
        severity: "warning",
        groupKey: `abuse:${created.id}`,
        url: `/abuse/${created.id}`,
        params: {
          reference: caseReference(created.number),
          category: parsedInput.category,
          deadlineHours: parsedInput.responseHours,
        },
      });
    }

    revalidate();
    return { id: created.id };
  });

/**
 * An operator's message, to one of the three audiences a case has.
 *
 * `internal` never leaves this console, `customer` reaches the account the
 * case is about, and `reporter` reaches whoever filed it. They are one action
 * because the composer is one box; they are three destinations because the
 * three must never see each other's words.
 */
export const addAbuseCaseMessageAction = actionClient
  .inputSchema(
    z.object({
      caseId: z.string().min(1),
      body: z.string().min(1).max(20_000),
      audience: z.enum(["customer", "internal", "reporter"]),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const abuseCase = await loadCase(parsedInput.caseId);

    const body = sanitizeAbuseBody(parsedInput.body);
    if (!body) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Write something before sending.",
      });
    }

    // A reply to the reporter goes out by email and records its own message,
    // because it needs the case address, the threading headers and the
    // per-contact rules that only the mailbox knows.
    if ("reporter" === parsedInput.audience) {
      const result = await sendToReporters({
        db,
        caseId: abuseCase.id,
        body,
        actorUserId: ctx.user.id,
      });

      if (0 === result.sent.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This case has nobody to reply to, or every contact has asked not to be mailed.",
        });
      }

      revalidate();
      return { ok: true as const };
    }

    await db.insert(abuseCaseMessages).values({
      caseId: abuseCase.id,
      authorKind: "operator",
      authorUserId: ctx.user.id,
      audience: parsedInput.audience,
      body,
    });

    await recordCaseEvent({
      db,
      caseId: abuseCase.id,
      type: "operator.replied",
      actorKind: "operator",
      actorUserId: ctx.user.id,
      metadata: { audience: parsedInput.audience },
    });

    // Only a message addressed to the customer restarts their clock.
    if ("customer" === parsedInput.audience && abuseCase.userId) {
      await db
        .update(abuseCases)
        .set({ status: "awaiting_customer" })
        .where(eq(abuseCases.id, abuseCase.id));

      await dispatchNotification({
        key: "abuse.case.notice",
        audience: { kind: "user", userId: abuseCase.userId },
        severity: "warning",
        // No group key: a reply is a new message every time, and collapsing
        // them onto the first would silently drop the conversation.
        url: `/abuse/${abuseCase.id}`,
        params: {
          reference: caseReference(abuseCase.number),
          category: "other",
          deadlineHours: 24,
        },
      });
    }

    revalidate();
    return { ok: true as const };
  });

/**
 * Applies a case's enforcement immediately, skipping the grace window.
 *
 * The window exists so a customer can act on the notice first; an operator
 * looking at a live flood does not have to wait it out.
 */
export const enforceAbuseCaseAction = actionClient
  .inputSchema(z.object({ caseId: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const abuseCase = await loadCase(parsedInput.caseId);

    const result = await enforceCase({
      db,
      caseId: abuseCase.id,
      actorKind: "operator",
      actorUserId: ctx.user.id,
    });

    if (0 === result.locked && result.failed > 0) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "No server could be reached. The lock reconciliation will retry.",
      });
    }

    revalidate();
    return result;
  });

/**
 * Moves a case.
 *
 * Terminal states carry a resolution because "closed" without a reason is the
 * version somebody has to reconstruct from the thread a year later.
 */
export const setAbuseCaseStatusAction = actionClient
  .inputSchema(
    z
      .object({
        caseId: z.string().min(1),
        status: z.enum([
          "triage",
          "open",
          "awaiting_customer",
          "awaiting_operator",
          "mitigated",
          "resolved",
          "rejected",
        ]),
        resolution: AbuseCaseResolutionSchema.optional(),
      })
      .refine(
        (value) =>
          !["resolved", "rejected"].includes(value.status) || value.resolution,
        {
          message: "Closing a case needs a reason.",
          path: ["resolution"],
        },
      ),
  )
  .action(async ({ parsedInput, ctx }) => {
    const abuseCase = await loadCase(parsedInput.caseId);
    const terminal = ["resolved", "rejected"].includes(parsedInput.status);

    const moved = await setCaseStatus({
      db,
      caseId: abuseCase.id,
      status: parsedInput.status,
      actorKind: "operator",
      actorUserId: ctx.user.id,
      extra: {
        ...(terminal
          ? {
              resolution: parsedInput.resolution,
              closedAt: new Date(),
              closedBy: ctx.user.id,
              respondBy: null,
            }
          : {}),
        ...("mitigated" === parsedInput.status
          ? { observeUntil: new Date(Date.now() + 24 * 3_600_000) }
          : {}),
      },
    });

    if (!moved) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This case is already closed.",
      });
    }

    // Settling a case is what releases the servers it locked. Doing it here
    // rather than on a timer means an operator who resolves a case sees the
    // customer's machines come back, instead of wondering for five minutes.
    if (terminal) {
      await releaseCase({
        db,
        caseId: abuseCase.id,
        actorKind: "operator",
        actorUserId: ctx.user.id,
      });
    }

    // `mitigated` relaxes rather than releases: the customer says it is fixed,
    // and the observation window is what checks. A powered-off server comes
    // back on so they can prove it; an isolated one stays isolated.
    if ("mitigated" === parsedInput.status) {
      await releaseCase({
        db,
        caseId: abuseCase.id,
        actorKind: "operator",
        actorUserId: ctx.user.id,
      });
    }

    if (terminal) {
      if (abuseCase.userId) {
        await dispatchNotification({
          key: "abuse.case.resolved",
          audience: { kind: "user", userId: abuseCase.userId },
          severity: "info",
          groupKey: `abuse:${abuseCase.id}:resolved`,
          url: `/abuse/${abuseCase.id}`,
          params: { reference: caseReference(abuseCase.number) },
        });
      }

      // Whoever filed it hears that it is settled. A reporter left wondering
      // chases us or escalates upstream, and both cost more than a sentence.
      if ("resolved" === parsedInput.status) {
        await notifyReportersResolved({ db, caseId: abuseCase.id }).catch(
          () => undefined,
        );
      }
    }

    revalidate();
    return { ok: true as const };
  });
