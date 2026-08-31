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
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { APP_DOMAIN } from "@virtbase/utils";
import type { PaymentMethod } from "@virtbase/validators";
import {
  CreatePaymentMethodSetupSessionOutputSchema,
  ListPaymentMethodsOutputSchema,
  RemovePaymentMethodInputSchema,
  RemovePaymentMethodOutputSchema,
  SetDefaultPaymentMethodInputSchema,
  SetDefaultPaymentMethodOutputSchema,
} from "@virtbase/validators";
import type { PaymentMethodSummary } from "../payment-methods";
import {
  listPaymentMethods,
  PaymentCapabilityUnavailableError,
  removePaymentMethod,
  requirePaymentCapability,
  SAVED_CREDENTIAL_PROVIDER_ID,
  setDefaultPaymentMethod,
} from "../payment-methods";
import { protectedProcedure } from "../trpc";

/**
 * Where the provider sends the customer once the credential is saved.
 *
 * Stripe's SetupIntent is confirmed in the browser by Elements, which is handed
 * its own return URL client-side, so this goes unused there. The port carries
 * it for providers that redirect instead, and it has to be somewhere the
 * customer is signed in.
 */
const SETUP_RETURN_URL = `${APP_DOMAIN}/account/settings`;

/** Domain shape to wire shape. Neither `provider` nor `externalId` exists here. */
const toPaymentMethod = (method: PaymentMethodSummary): PaymentMethod => ({
  id: method.id,
  type: method.type,
  brand: method.brand,
  last4: method.last4,
  exp_month: method.expMonth,
  exp_year: method.expYear,
  is_default: method.isDefault,
  invalid_at: method.invalidAt,
  invalid_reason: method.invalidReason,
});

/**
 * A saved credential is worth more than anything else a key can reach.
 *
 * The auth middleware already refuses an API key on any procedure that
 * declares no `permissions` - which is every procedure in this file, on
 * purpose. This repeats the refusal at the top of each mutation the way
 * `checkout.order` does: attaching or removing a way to take money is not
 * something a bearer credential with nobody behind it should be able to do,
 * and one belt is not enough for the difference between "a leaked key can read
 * the last four digits" and "a leaked key can point renewals at a card".
 */
const refuseApiKey = (apiKey: unknown) => {
  if (apiKey) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
};

/**
 * Turns a provider that cannot do what was asked into a server error.
 *
 * A disabled Stripe integration, or a provider with no `detachPaymentMethod`,
 * is a misconfiguration on our side and reads as one. Anything else - a Stripe
 * outage, a refused detach - is reported and answered the same way, because
 * the customer can do nothing useful with either.
 */
const asServerError = (error: unknown): TRPCError => {
  Sentry.captureException(error, {
    tags: {
      "payment-methods.error":
        error instanceof PaymentCapabilityUnavailableError
          ? "capability-unavailable"
          : "provider",
    },
  });

  return new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
};

/**
 * The customer's own saved payment credentials.
 *
 * Session-only: no `openapi` metadata and no API key permissions, so a key is
 * refused by the auth middleware before any of this runs. Every id arriving
 * from a client is a filter - the queries underneath scope by `ctx.userId` in
 * their `WHERE` and never select a row on an id alone.
 */
export const paymentMethodsRouter = {
  list: protectedProcedure
    .output(ListPaymentMethodsOutputSchema)
    .query(async ({ ctx }) => {
      const methods = await listPaymentMethods({
        db: ctx.db,
        // [!] Authorization: only ever the caller's own credentials
        userId: ctx.userId,
      });

      return { payment_methods: methods.map(toPaymentMethod) };
    }),

  /**
   * Starts collecting a credential the customer is not paying with yet.
   *
   * Rate limited because each call mints a SetupIntent at the provider, and a
   * loop over this is a way to fill someone else's Stripe account with
   * abandoned intents at no cost to the caller.
   */
  createSetupSession: protectedProcedure
    .meta({
      ratelimit: {
        requests: 8,
        seconds: "1 m",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `payment-method-setup:${userId || defaultFingerprint}`,
      },
    })
    .output(CreatePaymentMethodSetupSessionOutputSchema)
    .mutation(async ({ ctx }) => {
      refuseApiKey(ctx.apiKey);

      try {
        const createSetupSession = await requirePaymentCapability(
          SAVED_CREDENTIAL_PROVIDER_ID,
          "createSetupSession",
        );

        const session = await createSetupSession({
          userId: ctx.userId,
          returnUrl: SETUP_RETURN_URL,
        });

        if (!session.clientSecret) {
          // The port allows a provider to answer with a redirect instead, but
          // nothing on this path can show one, and returning an empty secret
          // would fail in the browser rather than here.
          throw new Error(
            `${SAVED_CREDENTIAL_PROVIDER_ID} returned no client secret for a setup session.`,
          );
        }

        return { client_secret: session.clientSecret };
      } catch (error) {
        throw asServerError(error);
      }
    }),

  setDefault: protectedProcedure
    .input(SetDefaultPaymentMethodInputSchema)
    .output(SetDefaultPaymentMethodOutputSchema)
    .mutation(async ({ ctx, input }) => {
      refuseApiKey(ctx.apiKey);

      const updated = await setDefaultPaymentMethod({
        db: ctx.db,
        // [!] Authorization: the id is matched together with the caller, so
        // another customer's credential is simply not found.
        userId: ctx.userId,
        paymentMethodId: input.id,
      });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return { payment_method: toPaymentMethod(updated) };
    }),

  /**
   * Detaches the credential at the provider and then hides the row.
   *
   * Rate limited: every call reaches a third party, and the detach is the half
   * that cannot be undone.
   */
  remove: protectedProcedure
    .meta({
      ratelimit: {
        requests: 8,
        seconds: "1 m",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `payment-method-remove:${userId || defaultFingerprint}`,
      },
    })
    .input(RemovePaymentMethodInputSchema)
    .output(RemovePaymentMethodOutputSchema)
    .mutation(async ({ ctx, input }) => {
      refuseApiKey(ctx.apiKey);

      let removed: PaymentMethodSummary | null;
      try {
        removed = await removePaymentMethod({
          db: ctx.db,
          // [!] Authorization: only ever the caller's own credentials
          userId: ctx.userId,
          paymentMethodId: input.id,
        });
      } catch (error) {
        // The provider refused or could not be reached. The row is untouched
        // and still listed, so the customer can try again.
        throw asServerError(error);
      }

      if (!removed) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Return nothing on success (void)
      return;
    }),
} satisfies TRPCRouterRecord;
