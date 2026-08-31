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

/** Mirrors `subscription_statuses`. Note the spelling: `cancelled`. */
export const SubscriptionStatusSchema = z.enum([
  "active",
  "past_due",
  "suspended",
  "cancelled",
  "ended",
]);

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

/**
 * The credential a renewal would charge, as the dashboard may see it.
 *
 * Three fields, and the output schema is what keeps it to three. `provider`
 * and `external_id` are absent for the same reason they are absent from
 * {@link PaymentMethodSchema}: `external_id` is the token an off-session
 * charge is made against, so putting it on the wire hands the browser half of
 * a payment credential.
 *
 * `id` is here because it is the join key. Whether the credential is still
 * usable - `invalid_at`, `exp_month` - is answered by `paymentMethods.list`,
 * which the billing page already loads; duplicating it here would give the two
 * surfaces two chances to disagree about the same card.
 */
export const SubscriptionPaymentMethodSchema = z.object({
  id: z
    .string()
    .regex(/^pm_[A-Z0-9]{25}$/)
    .meta({ examples: ["pm_1KDR24RNF2WY69G0FG7YHDQ6T"] }),
  brand: z
    .string()
    .nullable()
    .meta({ examples: ["visa"] }),
  last4: z
    .string()
    .nullable()
    .meta({ examples: ["4242"] }),
});

/**
 * A standing agreement to keep charging, as its owner sees it.
 *
 * Session-only, like the payment-method and abuse surfaces: the procedures
 * behind it declare no `openapi` metadata and no API key permissions, so none
 * of this is part of the public REST API.
 */
export const SubscriptionSchema = z.object({
  id: z
    .string()
    .regex(/^sub_[A-Z0-9]{25}$/)
    .meta({ examples: ["sub_1KDR24RNF2WY69G0FG7YHDQ6T"] }),
  /** `server` today. The column exists so a second product needs no migration. */
  subject_type: z.string().meta({ examples: ["server"] }),
  subject_id: z.string().meta({ examples: ["kvm_1KDR24RNF2WY69G0FG7YHDQ6T"] }),
  /**
   * The subject's display name, when it still exists.
   *
   * Null rather than absent: `subject_id` is deliberately not a foreign key,
   * so a subscription outlives the server it paid for and the name is simply
   * gone once the machine is destroyed.
   */
  subject_name: z.string().nullable(),
  status: SubscriptionStatusSchema,
  interval_months: z.number().int().positive(),
  currency: z.string(),
  current_period_start: z.date(),
  current_period_end: z.date(),
  auto_renew: z.boolean().meta({
    description:
      "Whether the period end triggers a collection or an expiry. Independent of `cancelled`.",
  }),
  /**
   * The credential a renewal would charge: the one this subscription names,
   * or the account default when it names none.
   */
  payment_method: SubscriptionPaymentMethodSchema.nullable(),
  /**
   * When the customer agreed we may charge them while they are not present.
   *
   * The date only - the wording they accepted (`mandate_text_version`) is an
   * internal artefact for a dispute, not something a dashboard renders.
   */
  mandate_accepted_at: z.date().nullable(),
  cancelled_at: z.date().nullable(),
  /**
   * Why it stopped, from a controlled vocabulary: `customer`, `admin`,
   * `abuse`, `dunning_exhausted`, `server_deleted`, `grace_period_elapsed`,
   * `term_elapsed`, `provision_failed`.
   *
   * Never free text a customer wrote. See `subscriptions.cancel`.
   */
  cancel_reason: z.string().nullable(),
  created_at: z.date(),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;

export const ListSubscriptionsOutputSchema = z.object({
  subscriptions: z.array(SubscriptionSchema),
});

export const SetSubscriptionAutoRenewInputSchema = z.object({
  id: SubscriptionSchema.shape.id,
  enabled: z.boolean(),
});

export const SetSubscriptionAutoRenewOutputSchema = z.object({
  subscription: SubscriptionSchema,
});

/**
 * Everything cancelling takes, which is an id and nothing else.
 *
 * `reason` is optional and must stay optional - see the note on
 * `subscriptions.cancel` about §312k BGB before adding a field here.
 */
export const CancelSubscriptionInputSchema = z.object({
  id: SubscriptionSchema.shape.id,
  reason: z.string().max(1000).optional(),
});

export const CancelSubscriptionOutputSchema = z.object({
  subscription: SubscriptionSchema,
});

export const ResumeSubscriptionInputSchema = z.object({
  id: SubscriptionSchema.shape.id,
});

export const ResumeSubscriptionOutputSchema = z.object({
  subscription: SubscriptionSchema,
});

/**
 * The mandate wording currently in force, named by the day it came into force.
 *
 * **Bump this whenever the wording changes**, and never edit the wording in
 * place without bumping it. The version is half of what makes
 * `subscriptions.mandate_text_version` worth storing: "they accepted
 * something" is not a defence in a dispute, "they accepted this text on this
 * date" is, and that only holds while one version identifies exactly one
 * wording.
 *
 * It lives here, in layer 0, because both halves need it and neither may own
 * it. The server refuses any other value - see `subscriptions.acceptMandate` -
 * so a client cannot record consent to text that was never shown; the opt-in
 * dialog renders the wording this constant names, and sends it back. A client
 * free to choose the string could claim the customer agreed to wording that
 * never existed.
 */
export const SUBSCRIPTION_MANDATE_TEXT_VERSION = "2026-08-30";

/**
 * Recording that the customer agreed to be charged while not present.
 *
 * `version` is what they were shown, not what they would like to have agreed
 * to: the shape is constrained here and the *value* is checked against
 * {@link SUBSCRIPTION_MANDATE_TEXT_VERSION} in the router, so a stale tab
 * whose wording has since been replaced is refused rather than silently
 * recorded against the new text.
 */
export const AcceptSubscriptionMandateInputSchema = z.object({
  id: SubscriptionSchema.shape.id,
  version: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .meta({ examples: [SUBSCRIPTION_MANDATE_TEXT_VERSION] }),
});

export const AcceptSubscriptionMandateOutputSchema = z.object({
  subscription: SubscriptionSchema,
});

export const RetrySubscriptionRenewalInputSchema = z.object({
  id: SubscriptionSchema.shape.id,
});

/**
 * What a manual retry actually did, in terms a customer can be told.
 *
 * Narrower than the collector's own `RenewalOutcome`, deliberately: the
 * dunning vocabulary - `superseded`, `rescheduled`, `no_retries` - describes
 * the state of a worker, and a customer who pressed a button needs to know
 * whether money is moving, whether their bank wants them, or whether nothing
 * happened. The router maps the collector's answer onto these four.
 */
export const RetrySubscriptionRenewalOutcomeSchema = z.enum([
  /** The charge was submitted. Whether it settles is the webhook's business. */
  "collecting",
  /** The bank wants the customer to confirm it before it will go through. */
  "awaiting_action",
  /** Declined again, and another attempt is already scheduled. */
  "retry_scheduled",
  /** Declined, and there are no attempts left on this renewal. */
  "exhausted",
  /** Nothing was attempted - somebody else got there first, or it cannot be. */
  "not_attempted",
]);

export type RetrySubscriptionRenewalOutcome = z.infer<
  typeof RetrySubscriptionRenewalOutcomeSchema
>;

export const RetrySubscriptionRenewalOutputSchema = z.object({
  subscription: SubscriptionSchema,
  outcome: RetrySubscriptionRenewalOutcomeSchema,
});
