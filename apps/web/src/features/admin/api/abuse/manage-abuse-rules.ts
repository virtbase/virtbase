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
import type { DryRunResult } from "@virtbase/api/abuse";
import { dryRunAbuseRules } from "@virtbase/api/abuse";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { abuseRules } from "@virtbase/db/schema";
import { AbuseRuleInputSchema } from "@virtbase/validators";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { actionClient } from "../../lib/action-client";

const revalidate = () => revalidatePath("/admin.virtbase.com");

const IdSchema = z.object({ id: z.string().min(1) });

/**
 * Creates a rule.
 *
 * Nothing here is clever on the operator's behalf: a rule saved with
 * `trustedSource` will lock servers without a human in the loop, and the form
 * says so rather than this action second-guessing it.
 */
export const createAbuseRuleAction = actionClient
  .inputSchema(AbuseRuleInputSchema)
  .action(async ({ parsedInput }) => {
    const [created] = await db
      .insert(abuseRules)
      .values(parsedInput)
      .returning({ id: abuseRules.id });

    if (!created) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "The rule could not be saved.",
      });
    }

    revalidate();
    return { id: created.id };
  });

export const updateAbuseRuleAction = actionClient
  .inputSchema(AbuseRuleInputSchema.extend(IdSchema.shape))
  .action(async ({ parsedInput: { id, ...values } }) => {
    const [updated] = await db
      .update(abuseRules)
      .set(values)
      .where(eq(abuseRules.id, id))
      .returning({ id: abuseRules.id });

    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Unknown rule." });
    }

    revalidate();
    return { ok: true as const };
  });

/**
 * Switches a rule off, or back on, without opening the form.
 *
 * Its own action because switching off a rule that is mis-firing is the thing
 * an operator does under pressure, and it should not require reading a page of
 * fields first.
 */
export const setAbuseRuleEnabledAction = actionClient
  .inputSchema(IdSchema.extend({ enabled: z.boolean() }))
  .action(async ({ parsedInput }) => {
    const [updated] = await db
      .update(abuseRules)
      .set({ enabled: parsedInput.enabled })
      .where(eq(abuseRules.id, parsedInput.id))
      .returning({ id: abuseRules.id });

    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Unknown rule." });
    }

    revalidate();
    return { ok: true as const };
  });

/**
 * Deletes a rule.
 *
 * `abuse_signals.matched_rule_id` is `set null`, so the signals this rule
 * decided keep their case and lose the explanation. Switching a rule off keeps
 * the trail intact and is what the list offers first.
 */
export const deleteAbuseRuleAction = actionClient
  .inputSchema(IdSchema)
  .action(async ({ parsedInput }) => {
    await db.delete(abuseRules).where(eq(abuseRules.id, parsedInput.id));

    revalidate();
    return { ok: true as const };
  });

/**
 * Replays a draft against the signals that have already arrived.
 *
 * Reads and writes nothing, so it is safe to run on every keystroke the
 * operator cares to spend - and it is the only way to find out that a new rule
 * sits behind a catch-all before it fails to fire at three in the morning.
 */
export const dryRunAbuseRuleAction = actionClient
  .inputSchema(
    AbuseRuleInputSchema.extend({ id: z.string().min(1).nullable() }),
  )
  .action(async ({ parsedInput }): Promise<DryRunResult> => {
    return await dryRunAbuseRules({ db, draft: parsedInput });
  });
