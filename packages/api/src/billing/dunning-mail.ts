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
import { and, eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { servers, subscriptions, users } from "@virtbase/db/schema";
import { sendEmail } from "@virtbase/email";
import PaymentMethodInvalid from "@virtbase/email/templates/payment-method-invalid";
import RenewalFinalWarning from "@virtbase/email/templates/renewal-final-warning";
import RenewalPaymentFailed from "@virtbase/email/templates/renewal-payment-failed";
import { getEmailTitle } from "@virtbase/email/translations";
import type { RenewalOutcome } from "./renewal-outcome";
import {
  RENEWAL_LADDER_EXHAUSTED_AFTER_DAYS,
  RENEWAL_LADDER_RUNGS,
} from "./retry-schedule";

/**
 * Telling the customer, which is the only part of dunning that recovers money.
 *
 * Most declines are an expired card or a cautious bank, and both are fixed in
 * a minute by a customer who knows. The ladder on its own climbs four rungs
 * over seven days in silence and then suspends a server, which recovers
 * nothing and produces a support thread.
 *
 * ## Two contacts, not five
 *
 * The first decline and the last rung, and nothing in between. A mail per rung
 * teaches customers that our mail is noise, and the middle rungs carry no new
 * information: the reason is the same and the deadline has not moved. The
 * expiry notice is a third *kind* of contact rather than a third rung - it is
 * about a credential, not a charge, and it can be sent before anything has
 * failed at all.
 *
 * ## Never twice for the same rung
 *
 * There is no `dunning_mail_sent_at` column, and `packages/db` is not mine to
 * add one to, so the idempotency key is the one the renewal row already
 * carries: **`(renewal id, attempt)`**.
 *
 * That works because of how the recorder is built rather than by luck.
 * `markRenewalCollecting` is the claim - it moves a row to `collecting` and
 * only one worker gets it - and `recordCollectionResult` writes the decline
 * *only* if the row is still `collecting`, under `SELECT ... FOR UPDATE`,
 * incrementing `attempt` as it goes. So each attempt number is written exactly
 * once, by exactly one caller, and this notifier runs on that caller's return
 * value. A redelivered webhook, a second reconcile pass, two overlapping
 * sweeps: every one of them reads a row that is no longer `collecting`, gets
 * `superseded` back, and mails nothing. It is the same shape as
 * `renewalReminderSentAt` in `send-renewal-notifications` - a durable fact,
 * written in the transaction the send is conditioned on - except the fact is
 * the attempt count rather than a timestamp column of its own.
 *
 * The expiry notice has its own key of the same kind:
 * `payment_methods.invalid_at`, flipped by a guarded `UPDATE ... WHERE
 * invalid_at IS NULL ... RETURNING`, so exactly one transaction can ever be
 * the one that marked the credential dead, and only that one mails.
 *
 * **What this does not survive** is a process that dies between the commit and
 * the send: the row has moved on, so nothing will retry the mail. That is
 * deliberate - at most once beats twice for dunning - but it is the reason a
 * `dunning_mail_sent_at` column would still be worth having: it would let a
 * sweep notice a rung whose mail never went out. Recording that need here
 * rather than working around it with a Redis marker, which would be a second
 * source of truth that expires.
 *
 * ## Mail never fails a renewal
 *
 * Every function here swallows its own failures into Sentry, as the crons do.
 * Money and mail are separate concerns and the money has already been decided
 * and committed by the time anything here runs.
 */

/** Which of the two ladder contacts a decline earns, if either. */
export type DunningStage = "first_failure" | "final_warning";

/**
 * The contact a recorded decline earns.
 *
 * Reads the outcome and not just the attempt count, because `no_retries` and
 * `exhausted` are indistinguishable from `(attempt, next_attempt_at)` alone -
 * both leave the count past the last rung with nothing scheduled - and they
 * want opposite treatment. `no_retries` is a customer who has heard once and
 * will never be charged again: they need the warning. `exhausted` is a
 * customer who has already had that warning and whose server is being
 * suspended within the quarter hour; the suspension mail
 * (`suspend-terminated-servers`) is their next contact, and a second warning
 * arriving alongside it says nothing they can still act on.
 *
 * The final warning goes out on the decline that *schedules* the last rung,
 * not on the one that spends it. That is the whole point of it: at
 * `RENEWAL_LADDER_RUNGS` there are still two days and one more charge to come,
 * so a customer who fixes their card keeps their server without doing anything
 * else. A warning sent after the last charge would be an obituary.
 *
 * The `>=` is not a stylistic choice: `no_retries` jumps the count clear past
 * the last rung, and a one-rung ladder would make the first decline the last
 * one - in which case the final warning wins, because it is the one that names
 * the suspension date.
 */
export const dunningStageFor = (
  outcome: RenewalOutcome,
  attempt: number,
): DunningStage | null => {
  if (outcome === "no_retries") return "final_warning";
  if (outcome !== "retry_scheduled") return null;
  if (attempt >= RENEWAL_LADDER_RUNGS) return "final_warning";
  if (attempt === 1) return "first_failure";

  return null;
};

/**
 * When the machine actually goes off, derived from the ladder itself.
 *
 * `subscription_renewals.period_start` is the instant the paid-for term ran
 * out, which is `servers.terminates_at` to the second, and the ladder is
 * declared as offsets from the first decline - which happens at that same
 * instant. So the day the customer loses the server is
 * `period_start + RENEWAL_LADDER_EXHAUSTED_AFTER_DAYS`: the last rung declines
 * there, the renewal is abandoned, the subscription moves to `suspended`, and
 * `/api/cron/suspend-terminated-servers` powers the machine off on its next
 * quarter-hourly run because a `suspended` subscription no longer matches that
 * sweep's `NOT EXISTS` exemption.
 *
 * **[!] Deliberately not `RENEWAL_SUSPENSION_GRACE_DAYS`**, which is one day
 * later and is the backstop for a subscription the ladder has *not* finished
 * with - see the note on `RENEWAL_LADDER_EXHAUSTED_AFTER_DAYS`. Computing the
 * date from the backstop told the customer they had until +8d while the ladder
 * took the server at +7d: they lost it roughly twenty-four hours before the
 * date in their own final warning, still believing they had a day left to fix
 * their card. A dunning mail that names the wrong day is worse than one that
 * names none, and the two constants can only stop drifting if the one the
 * customer is shown is read off the schedule that actually decides.
 */
export const renewalSuspensionDate = (periodStart: Date): Date =>
  new Date(
    periodStart.getTime() +
      RENEWAL_LADDER_EXHAUSTED_AFTER_DAYS * 24 * 60 * 60 * 1000,
  );

/** The card as the customer would recognise it. Never a pan; see the schema. */
export interface DunningCard {
  brand: string | null;
  last4: string | null;
}

export interface RenewalDeclineNotice {
  renewalId: string;
  subscriptionId: string;
  /** What {@link recordCollectionResult} decided, after it committed. */
  outcome: RenewalOutcome;
  /** The attempt count as it stands after this decline. */
  attempt: number;
  /** The period being collected for; its start is the old term end. */
  periodStart: Date;
  /** In the smallest unit of `currency`, as the renewal froze it. */
  amount: number;
  currency: string;
  /** The provider's own code, stored raw on the renewal. */
  failureCode: string;
  nextAttemptAt: Date | null;
  card: DunningCard | null;
  /**
   * Whether *this* transaction is the one that marked the credential dead.
   *
   * Not "whether the credential is dead": the guarded update means at most one
   * caller ever sees this true for a given card, which is what keeps the
   * expiry notice to one per credential rather than one per attempt.
   */
  credentialInvalidated: boolean;
}

interface DunningRecipient {
  name: string;
  email: string;
  locale: string | null;
  serverName: string;
}

/**
 * Who to write to, and what to call the thing they are about to lose.
 *
 * The subject is joined rather than assumed: `subscriptions.subject_id` is
 * deliberately not a foreign key, so the row it names can be gone. A mail
 * about a server that no longer exists is not worth sending, and the
 * subscription lifecycle has already ended such a subscription anyway - so a
 * miss here is a skip, not a fallback to the raw id.
 */
const loadRecipient = async (
  subscriptionId: string,
): Promise<DunningRecipient | null> =>
  db
    .select({
      name: users.name,
      email: users.email,
      locale: users.locale,
      serverName: servers.name,
    })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .leftJoin(
      servers,
      and(
        eq(subscriptions.subjectType, "server"),
        eq(servers.id, subscriptions.subjectId),
      ),
    )
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1)
    .then(([row]) =>
      row?.serverName
        ? {
            name: row.name,
            email: row.email,
            locale: row.locale,
            serverName: row.serverName,
          }
        : null,
    );

const sendFirstFailure = async (
  notice: RenewalDeclineNotice,
  recipient: DunningRecipient,
): Promise<void> => {
  const { nextAttemptAt } = notice;

  if (!nextAttemptAt) {
    // Cannot happen: this stage is only reached from `retry_scheduled`, which
    // always carries the next rung. Skipping beats sending a mail whose whole
    // value is a date it would then have to invent.
    Sentry.captureMessage(
      `[renewals] ${notice.renewalId} earned a first-failure mail with no next attempt; skipped.`,
      "warning",
    );
    return;
  }

  await sendEmail({
    to: recipient.email,
    subject: await getEmailTitle("renewal-payment-failed", recipient.locale),
    react: await RenewalPaymentFailed({
      email: recipient.email,
      name: recipient.name,
      locale: recipient.locale,
      serverName: recipient.serverName,
      amount: notice.amount,
      currency: notice.currency,
      failureCode: notice.failureCode,
      nextAttemptAt,
      cardBrand: notice.card?.brand,
      cardLast4: notice.card?.last4,
    }),
  });
};

const sendFinalWarning = async (
  notice: RenewalDeclineNotice,
  recipient: DunningRecipient,
): Promise<void> => {
  const suspendsAt = renewalSuspensionDate(notice.periodStart);

  await sendEmail({
    to: recipient.email,
    subject: await getEmailTitle("renewal-final-warning", recipient.locale, {
      date: suspendsAt,
    }),
    react: await RenewalFinalWarning({
      email: recipient.email,
      name: recipient.name,
      locale: recipient.locale,
      serverName: recipient.serverName,
      amount: notice.amount,
      currency: notice.currency,
      failureCode: notice.failureCode,
      // Null for a decline that struck the ladder off: there is no further
      // attempt, and saying there is would make the mail ignorable.
      lastAttemptAt: notice.nextAttemptAt,
      suspendsAt,
      cardBrand: notice.card?.brand,
      cardLast4: notice.card?.last4,
    }),
  });
};

const sendCredentialNotice = async (
  notice: RenewalDeclineNotice,
  recipient: DunningRecipient,
): Promise<void> => {
  await sendEmail({
    to: recipient.email,
    subject: await getEmailTitle("payment-method-invalid", recipient.locale),
    react: await PaymentMethodInvalid({
      email: recipient.email,
      name: recipient.name,
      locale: recipient.locale,
      reasonCode: notice.failureCode,
      cardBrand: notice.card?.brand,
      cardLast4: notice.card?.last4,
    }),
  });
};

/**
 * Sends whatever a committed decline earns, and never more than one thing.
 *
 * A ladder mail wins over the expiry notice when both would go out at once,
 * because it says everything the notice says - which card, why, what to do -
 * and adds the deadline. Two mails in the same second about the same card read
 * as a broken system and halve the chance either is opened.
 *
 * That leaves the expiry notice for the case it is actually needed in: a card
 * that dies on one of the silent middle rungs, where the customer would
 * otherwise hear nothing at all about a credential that can no longer work.
 *
 * Returns `void` and throws nothing. The renewal is already committed; a mail
 * outage is a Sentry event, not a failed collection.
 */
export const notifyRenewalDecline = async (
  notice: RenewalDeclineNotice,
): Promise<void> => {
  const stage = dunningStageFor(notice.outcome, notice.attempt);

  if (!stage && !notice.credentialInvalidated) return;

  try {
    const recipient = await loadRecipient(notice.subscriptionId);

    if (!recipient) {
      console.info(
        `[renewals] ${notice.renewalId} has no server to write about; no dunning mail sent.`,
      );
      return;
    }

    if (stage === "first_failure") {
      await sendFirstFailure(notice, recipient);
    } else if (stage === "final_warning") {
      await sendFinalWarning(notice, recipient);
    } else {
      await sendCredentialNotice(notice, recipient);
    }
  } catch (error) {
    console.error(
      `[renewals] Failed to send the ${stage ?? "payment-method-invalid"} mail for renewal ${notice.renewalId}.`,
      error,
    );
    Sentry.captureException(error, {
      tags: {
        renewalId: notice.renewalId,
        dunningStage: stage ?? "payment_method_invalid",
      },
    });
  }
};
