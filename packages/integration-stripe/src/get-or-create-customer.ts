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

import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";
import type Stripe from "stripe";
import { stripe } from "./client";

/**
 * The two Stripe keys this application holds are on different accounts.
 *
 * A customer id only means anything on the account that minted it, so once the
 * keys diverge every id in `users.stripe_customer_id` is meaningless to
 * whichever client did not create it. Stripe answers `No such customer` - a
 * `StripeInvalidRequestError`, which the payment adapter classifies as a
 * transport failure and retries - so without this the symptom is every renewal
 * on the platform sitting in a retry loop with nothing in the logs naming the
 * cause.
 *
 * Thrown instead, and named, so the first person to look at a stuck renewal
 * reads the actual problem. The fix is not in this file: it is the
 * `STRIPE_SECRET_KEY` migration `AGENTS.md` calls for, which removes the second
 * client altogether.
 */
export class StripeAccountMismatchError extends Error {
  constructor(
    readonly moduleAccountId: string,
    readonly clientAccountId: string,
  ) {
    super(
      `Stripe customer ids are minted on account ${moduleAccountId} (STRIPE_SECRET_KEY) but this caller's client speaks to account ${clientAccountId} (integration_secrets). Every stored customer id is meaningless on that account. Point both at the same Stripe account.`,
    );
    this.name = "StripeAccountMismatchError";
  }
}

/**
 * The account a client's key belongs to, asked once per client per process.
 *
 * Keyed on the client object rather than the key, because the key is not
 * readable from a `Stripe` instance through any supported API - and because
 * nothing here should be holding a secret it does not need. A `WeakMap` also
 * means a discarded provider instance takes its entry with it.
 *
 * Only successes are memoised. A probe that failed must not become a cached
 * verdict, and it must not be cached as a *mismatch* either - see
 * {@link assertOneStripeAccount}.
 */
const accountIds = new WeakMap<Stripe, Promise<string>>();

const accountIdOf = (client: Stripe): Promise<string> => {
  const cached = accountIds.get(client);

  if (cached) return cached;

  const pending = client.accounts
    .retrieveCurrent()
    .then((account) => account.id);

  accountIds.set(client, pending);

  // A failed probe is forgotten rather than remembered as a failure, so the
  // next caller asks again instead of inheriting one bad minute.
  pending.catch(() => accountIds.delete(client));

  return pending;
};

/**
 * Refuses to hand back a customer id when the two clients are on two accounts.
 *
 * **This is a detector, not the fix.** The hazard is that
 * `users.stripe_customer_id` is a single column shared by two clients whose
 * keys nothing keeps in step: the module-level `stripe`, built from
 * `STRIPE_SECRET_KEY`, and the one `StripePaymentProvider` builds from
 * `integration_secrets`. Every customer who has ever checked out already has an
 * id minted by the first, so passing a client to {@link
 * getOrCreateStripeCustomer} cannot on its own make the second one safe - the
 * id it gets back was not created by it. What this does is notice, once per
 * client per process, that the two keys are on different accounts, and turn
 * what would otherwise be a silent platform-wide retry loop into one named
 * error.
 *
 * **A probe that cannot be answered does not block anything.** Stripe being
 * unreachable, or a restricted key without account read access, is not evidence
 * of a mismatch, and turning it into one would invent an outage where the
 * charge would have gone through. It is warned about and the call proceeds -
 * the guard is worth having only for the case where it can actually prove
 * something.
 */
const assertOneStripeAccount = async (client: Stripe | null) => {
  // Nothing to disagree with: the caller is using the very client that mints
  // the ids, or there is no second key configured at all.
  if (!client || !stripe || client === stripe) return;

  let moduleAccountId: string;
  let clientAccountId: string;

  try {
    [moduleAccountId, clientAccountId] = await Promise.all([
      accountIdOf(stripe),
      accountIdOf(client),
    ]);
  } catch (error) {
    console.warn(
      `[stripe] Could not confirm that STRIPE_SECRET_KEY and the configured Stripe secret are on the same account: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  if (moduleAccountId !== clientAccountId) {
    throw new StripeAccountMismatchError(moduleAccountId, clientAccountId);
  }
};

/**
 * The Stripe customer for a user, created on first use.
 *
 * `client` exists because this application holds two Stripe clients and
 * nothing guarantees they carry the same key. The module-level `stripe` is
 * built from `STRIPE_SECRET_KEY`; `StripePaymentProvider` builds its own from
 * the secret in `integration_secrets`. A customer id only means anything on
 * the account that minted it, so resolving the customer through one key and
 * charging through the other is a live hazard the moment the two diverge: an
 * off-session renewal would either fail against a customer the account has
 * never seen, or - if both keys are valid on different accounts - reach for
 * the wrong one entirely. Anything holding its own client must pass it.
 *
 * The default keeps every existing caller unchanged. Checkout is built on the
 * module-level client throughout, so passing nothing is the correct answer
 * there rather than an oversight.
 *
 * **Passing a client does not make the id safe, and never did.** It decides
 * which account a *new* customer is minted on, and nothing more; the early
 * return below hands back whatever `users.stripe_customer_id` already holds,
 * which for every customer who has ever checked out was minted with
 * `STRIPE_SECRET_KEY` regardless of who is asking now. There is one column and
 * two keys, so the column can only ever belong to one account. What the
 * parameter buys is that the hazard is *detectable*: with a client to compare
 * against, {@link assertOneStripeAccount} can say the two keys have diverged
 * and name it, instead of the divergence surfacing as `No such customer` three
 * layers down. Closing it for real is the `STRIPE_SECRET_KEY` migration
 * `AGENTS.md` calls for, which removes the second client altogether.
 */
export const getOrCreateStripeCustomer = async (
  userId: string,
  client: Stripe | null = stripe,
) => {
  // Before either branch, because both are wrong when the keys have diverged:
  // the early return hands back an id the caller's account has never seen, and
  // creation writes an id into a column the *other* client will read.
  await assertOneStripeAccount(client);

  const user = await db.transaction(
    async (tx) => {
      return tx
        .select({
          id: users.id,
          stripeCustomerId: users.stripeCustomerId,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(([res]) => res);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!user) {
    throw new Error("Failed to get the Stripe customer for non-existent user.");
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  return createStripeCustomer(userId, client);
};

const createStripeCustomer = async (userId: string, client: Stripe | null) => {
  const created = await db.transaction(
    async (tx) => {
      if (!client) {
        throw new Error(
          "STRIPE_SECRET_KEY is not set in the .env. Stripe customer creation failed.",
        );
      }

      const user = await tx
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          locale: users.locale,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(([res]) => res);

      if (!user) {
        throw new Error(
          "Failed to create a Stripe customer for non-existent user.",
        );
      }

      const customer = await client.customers.create({
        email: user.email,
        ...(user.name && {
          individual_name: user.name,
        }),
        ...(user.locale && {
          preferred_locales: [user.locale],
        }),
        metadata: {
          userId: user.id,
        },
      });

      await tx
        .update(users)
        .set({
          stripeCustomerId: customer.id,
        })
        .where(eq(users.id, user.id));

      return customer;
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  return created.id;
};
