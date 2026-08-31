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

import { and, eq, isNotNull, isNull, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { paymentMethods, subscriptions } from "@virtbase/db/schema";

type DetachPaymentMethodsStepParams = {
  userId: string;
};

/**
 * Gives back every saved credential at the provider, then deletes the rows.
 *
 * **Detaching is the erasure; the delete is bookkeeping.** `payment_methods`
 * holds a pointer to a token the provider keeps, and that token is what can
 * take money. Deleting our row first - or instead - produces the worst
 * outcome available here: a customer who is gone from our database and still
 * has a live card attached at Stripe, chargeable by anything holding the
 * token, with nothing left on our side that even knows it exists. So the
 * provider goes first, one credential at a time, and the rows go afterwards.
 * It is the same ordering, and the same argument, as `removePaymentMethod`.
 *
 * **A provider failure fails the step.** It is not caught, not reported and
 * continued past: a detach that did not happen is a credential that is still
 * chargeable, and swallowing it would leave the erasure log claiming an
 * erasure that did not occur. The workflow is durable, so the run stops where
 * it is and retries; nothing after this point - the Stripe customer deletion,
 * the subject-data erasure, the anonymisation - has happened yet, so the
 * account is still whole and still findable while somebody fixes whatever
 * broke. `revokeExternalIdentitiesStep` and `detachExternalServicesStep` are
 * best-effort by comparison, and can afford to be: an unrevoked OAuth grant
 * cannot bill anyone.
 *
 * **Each credential is marked the moment its detach returns**, before the next
 * one is attempted, which is what makes a retry safe. Detaching a credential
 * the provider has already let go is an error at Stripe, so a step that
 * started over from the top after failing halfway would fail forever on the
 * ones it had already done, and the offboarding could never finish. Rows that
 * still say they are live are exactly the ones whose credential is still live.
 *
 * [!] Must run before `detachExternalServicesStep`, which deletes the Stripe
 * customer and takes every attached credential with it. Afterwards, each
 * detach here would be asking the provider to release something it no longer
 * has - an error, and a permanently wedged offboarding.
 *
 * The provider is resolved through the registry rather than by importing
 * `@virtbase/integration-stripe` - the rule `AGENTS.md` states and
 * `bun check:boundaries` enforces. The resolver is loaded lazily for the
 * reason `resetPointerRecordsStep` gives: it reaches `integrations`, a
 * module-level const inside an import cycle, and a static import of that from
 * a step module can be evaluated while the module is still initialising -
 * which fails the whole step bundle with a TDZ error rather than just this
 * step.
 *
 * [!] This module must export nothing but its step; see `erasure-plan.ts`.
 */
export async function detachPaymentMethodsStep({
  userId,
}: DetachPaymentMethodsStepParams) {
  "use step";

  const saved = await db
    .select({
      id: paymentMethods.id,
      provider: paymentMethods.provider,
      externalId: paymentMethods.externalId,
      detachedAt: paymentMethods.detachedAt,
    })
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, userId));

  // Rows that already say they are detached were given back either by the
  // customer removing the card or by an earlier attempt at this step. Asking
  // the provider twice is an error at its end.
  const live = saved.filter((method) => !method.detachedAt);

  let detached = 0;

  for (const method of live) {
    const { requirePaymentCapability } = await import(
      "../../payment-methods/provider"
    );

    const detachPaymentMethod = await requirePaymentCapability(
      method.provider,
      "detachPaymentMethod",
    );

    await detachPaymentMethod(method.externalId);

    // Written per credential rather than once at the end: this mark is what a
    // retry reads to know the token is already gone.
    await db
      .update(paymentMethods)
      .set({ detachedAt: sql`now()`, isDefault: false })
      .where(
        and(
          eq(paymentMethods.id, method.id),
          // [!] Authorization: re-asserted rather than inherited from the read
          // above, which is a separate statement ago.
          eq(paymentMethods.userId, userId),
          isNull(paymentMethods.detachedAt),
        ),
      );

    detached++;
  }

  return db.transaction(
    async (tx) => {
      // `subscriptions.payment_method_id` references `(id, user_id)` with no
      // `onDelete`, so a subscription still naming one of these rows would
      // refuse the delete below. Subscriptions are `retain` - they are the
      // agreement the retained charges were taken under - so the pointer is
      // cleared and the row stays. Only the column is nulled: setting the
      // composite key null wholesale would take `user_id` with it, which is
      // the reason the constraint carries no `onDelete` in the first place.
      const unpointed = await tx
        .update(subscriptions)
        .set({ paymentMethodId: null })
        .where(
          and(
            eq(subscriptions.userId, userId),
            isNotNull(subscriptions.paymentMethodId),
          ),
        )
        .returning({ id: subscriptions.id });

      // [!] Not left to the foreign key. `payment_methods.user_id` cascades
      // from `users`, but `anonymizeUserStep` keeps that row - scrubbed to a
      // tombstone so the retained invoices still have somebody to point at -
      // so no cascade from `users` ever fires during an offboarding.
      const deleted = await tx
        .delete(paymentMethods)
        .where(eq(paymentMethods.userId, userId))
        .returning({ id: paymentMethods.id });

      return {
        paymentMethods: deleted.length,
        detachedPaymentMethods: detached,
        unpointedSubscriptions: unpointed.length,
      };
    },
    { accessMode: "read write", isolationLevel: "read committed" },
  );
}
