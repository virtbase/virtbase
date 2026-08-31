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

import { and, asc, eq, gt, inArray, isNotNull } from "@virtbase/db";
import type { db as database, Executor } from "@virtbase/db/client";
import { paymentMethods, users } from "@virtbase/db/schema";
import type { Stripe } from "@virtbase/integration-stripe";
import { stripe } from "@virtbase/integration-stripe";
import { recordPaymentMethod } from "../payment-methods/record";
import { describeStripePaymentMethod } from "../payment-methods/settle-stripe-payment-method";

/**
 * The cards customers saved before this application wrote them down.
 *
 * `payment_methods` is new. Until it existed the billing page listed cards
 * straight out of Stripe on every render, so a credential a customer saved in
 * 2024 exists at the provider and nowhere here - and every reader added since
 * asks the local table. To such a customer the billing page says "no payment
 * methods", `setAutoRenew` refuses with "automatic renewal needs a usable
 * payment method", and `collectForRenewal` answers `no_payment_method`, all
 * for a card that would have charged perfectly well.
 *
 * ## This enrols nobody in anything
 *
 * Recording a credential is bookkeeping about a card the customer already
 * chose to save. It is not consent to charge it while they are away: nothing
 * here writes `subscriptions.auto_renew` or `mandate_accepted_at`, and the
 * opt-in that does remains a customer action, one customer at a time. What
 * this changes is that the opt-in can be *offered*, because the card it would
 * name is finally visible.
 *
 * ## What it will not touch
 *
 * **A credential already recorded locally is skipped outright** - not
 * re-recorded, not refreshed. `recordPaymentMethod` deliberately clears
 * `invalid_at` and `detached_at` on the way through, because a provider that
 * has just handed back a working credential has overruled whatever it said
 * last time; a bulk sweep has no such news and would only undo the dunning
 * ladder's work and resurrect cards customers removed. Skipping is also what
 * makes a re-run cost nothing and change nothing.
 *
 * **The customer's default is left where it is.** A card is only ever made
 * default by `recordPaymentMethod`'s own rule - the first live credential a
 * customer has - so anyone who already has one keeps it. For a customer with
 * none, the first recordable card wins, and Stripe lists newest first, so that
 * is the most recently saved one.
 *
 * **Nothing is removed.** A local row whose credential no longer exists at
 * Stripe is left alone: `payment_method.detached` is what retires those, and a
 * one-off script guessing at absence would soft-delete every card belonging to
 * a customer whose listing merely failed.
 */

/** Customers read per round trip through the users table. */
export const PAYMENT_METHOD_BACKFILL_BATCH_SIZE = 100;

/** Stripe's own maximum page size. A customer with more saved credentials
 * than this does not exist; if one ever does, the rest arrive on the next
 * run of whatever records them going forward. */
export const STRIPE_PAYMENT_METHOD_PAGE_SIZE = 100;

/** The provider whose credentials this backfills. See `provider.ts`. */
const PROVIDER = "stripe";

type Database = typeof database;

/**
 * Reads one customer's saved credentials from the provider.
 *
 * A parameter rather than a hard-wired call so the backfill can be tested
 * against PGlite and a handful of literal objects, with no HTTP and no
 * process-wide module mock - `mock.module` in bun is global to the whole test
 * run, and this is not worth breaking a sibling suite over.
 */
export type ListProviderPaymentMethods = (
  stripeCustomerId: string,
) => Promise<Stripe.PaymentMethod[]>;

/** The real thing: every credential Stripe holds for one customer. */
export const listStripePaymentMethods: ListProviderPaymentMethods = async (
  stripeCustomerId,
) => {
  if (!stripe) {
    throw new Error(
      "Stripe is not configured. Saved credentials cannot be listed.",
    );
  }

  const page = await stripe.paymentMethods.list({
    customer: stripeCustomerId,
    limit: STRIPE_PAYMENT_METHOD_PAGE_SIZE,
  });

  return page.data;
};

export interface PaymentMethodBackfillCustomer {
  userId: string;
  stripeCustomerId: string;
}

/**
 * The customers who could have a credential at the provider.
 *
 * Only `stripe_customer_id IS NOT NULL`: a user who has never reached checkout
 * has no customer object to ask about, and asking anyway would be one wasted
 * API call per row of the users table.
 *
 * Keyset paging on the primary key rather than `OFFSET`. The set does not
 * shrink as this runs - unlike the subscriptions backfill, a customer stays a
 * candidate after being done - so the cursor is the only thing that moves a
 * run forward, and it is also what makes an interrupted run resumable.
 */
export const findPaymentMethodBackfillCustomers = async (
  executor: Executor,
  {
    after = null,
    limit = PAYMENT_METHOD_BACKFILL_BATCH_SIZE,
  }: { after?: string | null; limit?: number } = {},
): Promise<PaymentMethodBackfillCustomer[]> => {
  const rows = await executor
    .select({ userId: users.id, stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(
      and(
        isNotNull(users.stripeCustomerId),
        after ? gt(users.id, after) : undefined,
      ),
    )
    .orderBy(asc(users.id))
    .limit(limit);

  return rows.map((row) => ({
    userId: row.userId,
    // Non-null by the predicate above; the column type does not know that.
    stripeCustomerId: row.stripeCustomerId as string,
  }));
};

/** A credential at the provider that has no row here yet. */
export interface PaymentMethodBackfillCandidate {
  userId: string;
  stripeCustomerId: string;
  externalId: string;
  type: string;
  brand: string | null;
  last4: string | null;
}

/**
 * Which of a customer's provider credentials are not recorded here.
 *
 * The lookup is by `(provider, external_id)` and deliberately *not* scoped to
 * the customer: that pair is unique across the whole table, so a credential
 * recorded against somebody else is not one this run may claim -
 * `recordPaymentMethod` would refuse it - and skipping it is the same answer
 * arrived at without an exception.
 */
export const findMissingPaymentMethods = async (
  executor: Executor,
  {
    userId,
    stripeCustomerId,
    methods,
  }: PaymentMethodBackfillCustomer & { methods: Stripe.PaymentMethod[] },
): Promise<PaymentMethodBackfillCandidate[]> => {
  if (0 === methods.length) return [];

  const recorded = await executor
    .select({ externalId: paymentMethods.externalId })
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.provider, PROVIDER),
        inArray(
          paymentMethods.externalId,
          methods.map((method) => method.id),
        ),
      ),
    );

  const known = new Set(recorded.map((row) => row.externalId));

  return methods
    .filter((method) => !known.has(method.id))
    .map((method) => {
      const { brand, last4 } = describeStripePaymentMethod(method);

      return {
        userId,
        stripeCustomerId,
        externalId: method.id,
        type: method.type,
        brand,
        last4,
      };
    });
};

export interface PaymentMethodBackfillProgress {
  /** Customers considered so far. */
  scanned: number;
  /** Credentials seen at the provider. */
  found: number;
  created: number;
  /** Credentials already recorded here. */
  skipped: number;
  /** Customers whose credentials could not be read. */
  failed: number;
  /** The last user id looked at, to resume from. */
  cursor: string;
}

export interface BackfillPaymentMethodsOptions {
  db: Database;
  /**
   * Reads one customer's credentials. Defaults to
   * {@link listStripePaymentMethods}.
   */
  listPaymentMethods?: ListProviderPaymentMethods;
  /**
   * **Defaults to true.** Forgetting the flag has to be the harmless
   * direction: this writes a row per saved card across the whole customer
   * base, and nothing afterwards can tell the rows it wrote from the ones that
   * were already there.
   */
  dryRun?: boolean;
  batchSize?: number;
  /** Stop after this many customers. Bounds a first run. */
  limit?: number;
  /** Resume from a user id, exclusive. */
  after?: string | null;
  /** Called once per batch, for progress output. */
  onProgress?: (progress: PaymentMethodBackfillProgress) => void;
  /** Called for each credential that would be recorded. Used by the dry run
   * to print the plan. */
  onCandidate?: (candidate: PaymentMethodBackfillCandidate) => void;
  /** Called for each customer whose credentials could not be read. */
  onFailure?: (
    customer: PaymentMethodBackfillCustomer & { error: unknown },
  ) => void;
}

export interface BackfillPaymentMethodsResult
  extends PaymentMethodBackfillProgress {
  dryRun: boolean;
}

/**
 * Records the provider's saved credentials, in batches, resumably.
 *
 * **Idempotent**, and by skipping rather than by upserting - see the note at
 * the top of this file. A second run reports every credential as `skipped` and
 * issues no write at all.
 *
 * **One customer's failure is not the run's.** A listing can fail for reasons
 * that belong to one customer and nobody else - a customer object deleted at
 * Stripe while the id is still on the user row is the common one - and a
 * script that dies on the first of them never reaches the thousands behind it.
 * Failures are counted, reported through `onFailure`, and summarised at the
 * end, so a run that failed *everywhere* (a bad API key) is not mistaken for a
 * run with nothing to do.
 *
 * Credentials are recorded one at a time, in the order the provider listed
 * them, because `recordPaymentMethod` decides the default by looking at what
 * the customer already has - a concurrent write of the same customer's first
 * two cards would race for it and one of them would lose to the unique index.
 */
export const backfillPaymentMethods = async ({
  db,
  listPaymentMethods = listStripePaymentMethods,
  dryRun = true,
  batchSize = PAYMENT_METHOD_BACKFILL_BATCH_SIZE,
  limit,
  after = null,
  onProgress,
  onCandidate,
  onFailure,
}: BackfillPaymentMethodsOptions): Promise<BackfillPaymentMethodsResult> => {
  let cursor = after;
  let scanned = 0;
  let found = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (;;) {
    const remaining = undefined === limit ? batchSize : limit - scanned;
    if (0 >= remaining) break;

    const customers = await findPaymentMethodBackfillCustomers(db, {
      after: cursor,
      limit: Math.min(batchSize, remaining),
    });

    if (0 === customers.length) break;

    scanned += customers.length;
    cursor = customers[customers.length - 1]?.userId ?? cursor;

    for (const customer of customers) {
      let methods: Stripe.PaymentMethod[];

      try {
        methods = await listPaymentMethods(customer.stripeCustomerId);
      } catch (error) {
        failed += 1;
        onFailure?.({ ...customer, error });
        continue;
      }

      found += methods.length;

      const candidates = await findMissingPaymentMethods(db, {
        ...customer,
        methods,
      });

      skipped += methods.length - candidates.length;

      for (const candidate of candidates) onCandidate?.(candidate);

      if (dryRun) {
        // Counted as if it had worked, so the number printed by the safe mode
        // is the number the real run will write.
        created += candidates.length;
        continue;
      }

      // The candidates carry only enough of a credential to print a line; the
      // provider object is what the row is written from.
      const byExternalId = new Map(
        methods.map((method) => [method.id, method]),
      );

      for (const candidate of candidates) {
        const method = byExternalId.get(candidate.externalId);
        if (!method) continue;

        try {
          await recordPaymentMethod({
            db,
            userId: customer.userId,
            provider: PROVIDER,
            externalId: method.id,
            type: method.type,
            ...describeStripePaymentMethod(method),
          });

          created += 1;
        } catch (error) {
          // Another writer got there first - the attach webhook for a card
          // saved while this was running, or a second copy of this script.
          // The row exists either way, which is the outcome that was wanted.
          failed += 1;
          onFailure?.({ ...customer, error });
        }
      }
    }

    onProgress?.({
      scanned,
      found,
      created,
      skipped,
      failed,
      cursor: cursor ?? "",
    });
  }

  return {
    scanned,
    found,
    created,
    skipped,
    failed,
    cursor: cursor ?? "",
    dryRun,
  };
};
