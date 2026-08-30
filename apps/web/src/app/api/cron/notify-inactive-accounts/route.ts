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

import * as Sentry from "@sentry/nextjs";
import {
  findAccountsToRemind,
  findInactivityCandidates,
  isEligibleForInactivityDeletion,
  markReminderSent,
  scheduleInactivityDeletion,
} from "@virtbase/api/privacy";
import { sendEmail } from "@virtbase/email";
import InactivityNotice from "@virtbase/email/templates/account-inactivity-notice";
import InactivityReminder from "@virtbase/email/templates/account-inactivity-reminder";
import { getEmailTitle } from "@virtbase/email/translations";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Schedules abandoned accounts for deletion, and reminds the ones already
 * scheduled.
 *
 * The default is not timidity. `last_seen_at` is only as old as the column,
 * and the migration that added it backfills from sessions that live three
 * days - so the first cycles run against data that is thinner than it looks.
 * Arming this against a half-populated column schedules every long-standing
 * customer at once, and the notice emails go out before anybody notices.
 */
const handler = withCronSecret(async () => {
  console.log(
    `[CRON] Starting inactivity sweep. Current time is:`,
    new Date().toISOString(),
  );

  const candidates = await findInactivityCandidates();
  const verdicts = candidates.map((candidate) => ({
    candidate,
    verdict: isEligibleForInactivityDeletion(candidate.activity),
  }));

  const eligible = verdicts.filter(({ verdict }) => verdict.eligible);

  // The passed-over accounts are the interesting half of the report: they are
  // where a rule that is too aggressive would show up as a customer nobody
  // expected to see listed.
  const skipped = verdicts.reduce<Record<string, number>>(
    (counts, { verdict }) => {
      if (verdict.eligible) return counts;
      counts[verdict.reason] = (counts[verdict.reason] ?? 0) + 1;
      return counts;
    },
    {},
  );

  console.log(
    `[CRON] ${candidates.length} candidate(s), ${eligible.length} eligible.`,
    "Skipped:",
    skipped,
  );

  for (const { candidate } of eligible) {
    const scheduledAt = await scheduleInactivityDeletion(candidate.userId);

    // The schedule is already written, and a scheduled account is no longer a
    // candidate - so an unsent notice is never retried. `sendEmail` rejects on
    // a provider failure, and letting that escape would abandon every account
    // after this one in the batch as well. Report it and keep going: the
    // remaining customers still get told.
    try {
      await sendEmail({
        to: candidate.email,
        subject: await getEmailTitle(
          "account-inactivity-notice",
          candidate.locale,
        ),
        react: await InactivityNotice({
          email: candidate.email,
          name: candidate.name,
          locale: candidate.locale,
          scheduledAt,
        }),
      });
    } catch (error) {
      console.error(
        "[CRON] Failed to notify",
        candidate.userId,
        "of scheduled deletion: ",
        error,
      );
      Sentry.captureException(error);
    }
  }

  const toRemind = await findAccountsToRemind();
  console.log("[CRON] Reminding", toRemind.length, "account(s).");

  for (const account of toRemind) {
    if (!account.scheduledAt) continue;

    try {
      await sendEmail({
        to: account.email,
        subject: await getEmailTitle(
          "account-inactivity-reminder",
          account.locale,
          { date: account.scheduledAt },
        ),
        react: await InactivityReminder({
          email: account.email,
          name: account.name,
          locale: account.locale,
          scheduledAt: account.scheduledAt,
        }),
      });
    } catch (error) {
      // Deliberately left unmarked, so this customer's reminder is retried on
      // the next run - the existing contract below. Caught only so that one
      // undeliverable address cannot starve every reminder behind it.
      console.error(
        "[CRON] Failed to remind",
        account.userId,
        "of scheduled deletion: ",
        error,
      );
      Sentry.captureException(error);
      continue;
    }

    // After sending, so a failure to send retries next run rather than
    // silently consuming the customer's last warning.
    await markReminderSent(account.userId);
  }

  return new Response("OK", { status: 200 });
});

export { handler as GET };
