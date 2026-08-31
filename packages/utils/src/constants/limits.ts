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

export const MAX_SSH_KEYS_PER_USER = 100;

/**
 * The number of days to keep the server data after
 * a server was suspended.
 */
export const SERVER_DELETION_GRACE_PERIOD_DAYS = 5;

/**
 * The maximum number of active ISO image downloads per user.
 */
export const MAX_ACTIVE_ISO_DOWNLOADS_PER_USER = 3;

/**
 * The maximum size of an ISO image download in bytes.
 */
export const MAX_ISO_DOWNLOAD_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10GB

/**
 * The expiration time of an ISO image download in minutes.
 */
export const ISO_DOWNLOAD_EXPIRATION_MINUTES = 60; // 1 hour

/**
 * The number of hours after which an unfinished backup is considered
 * unresolvable and is marked as failed by reconciliation. A `vzdump` task
 * that runs longer than this has not survived the node's task index anyway.
 */
export const BACKUP_STALE_AFTER_HOURS = 12;

/**
 * The number of minutes reconciliation waits for a backup archive to show up
 * on the backup storage after its task reported success, before it treats the
 * archive as gone.
 */
export const BACKUP_ARCHIVE_GRACE_MINUTES = 10;

/**
 * How many days a downloaded template image may be kept before it is
 * re-downloaded. Overridable per template via `imageRefreshDays`.
 *
 * A vendor repoints a `-latest-` alias on every point release, so an image is
 * refreshed on a timer rather than only when its checksum changes - most
 * template images deliberately carry no checksum for exactly that reason.
 */
export const TEMPLATE_IMAGE_REFRESH_DAYS = 7;

/**
 * The number of hours after which an unsettled template image download is
 * considered unresolvable and marked as failed. A `download-url` task that has
 * not finished within this has not survived the node's task index either.
 */
export const TEMPLATE_IMAGE_STALE_AFTER_HOURS = 6;

/**
 * How long a re-authentication counts for.
 *
 * Sensitive actions - deleting the account, exporting every record we hold -
 * require the customer to prove who they are again, and this is the width of
 * the window that proof opens. Short enough that a walked-away-from laptop is
 * not a standing authorisation, long enough to read a confirmation dialog and
 * think about it.
 *
 * [!] This is deliberately *not* Better Auth's `session.freshAge`. That option
 * is measured from the session's creation and never refreshes, and it gates
 * `/list-sessions`, `/unlink-account` and passkey registration - none of which
 * we want to restrict. See `packages/api/src/step-up`.
 */
export const STEP_UP_WINDOW_SECONDS = 10 * 60; // 10 minutes

/**
 * How long invoices and the booking documents behind them are kept after an
 * account is erased.
 *
 * German tax and commercial law, counted from the end of the calendar year the
 * document was issued. This is why erasure is anonymisation rather than
 * deletion: the `users` row has to survive as a tombstone so these keep a
 * valid foreign key. Once the window closes, the retention sweep takes the
 * invoices and finally the tombstone with them.
 */
export const INVOICE_RETENTION_YEARS = 10;

/**
 * How long a finished data export stays downloadable.
 *
 * An export is a complete dossier on one person, so it is deliberately
 * short-lived. Long enough to survive a weekend, short enough that a forgotten
 * download link is not a standing liability.
 */
export const DATA_EXPORT_TTL_DAYS = 7;

/**
 * The shortest interval between two exports for the same customer.
 *
 * Article 12(5) permits refusing manifestly excessive repeat requests, and an
 * unbounded export endpoint is a denial-of-service vector against the
 * accounting provider's API as much as against us.
 */
export const DATA_EXPORT_MIN_INTERVAL_HOURS = 24;

/** Length of the generated passphrase that opens an export. */
export const DATA_EXPORT_PASSPHRASE_LENGTH = 24;

/**
 * How long an account sits scheduled before it is actually erased.
 *
 * The window in which a customer can change their mind - and, more to the
 * point, in which someone whose account was taken over still receives the
 * warning emails and can stop it. Short enough that "delete my account" does
 * not feel like a suggestion.
 */
export const ACCOUNT_DELETION_GRACE_PERIOD_DAYS = 14;

/**
 * How long the emailed confirmation link stays valid.
 *
 * The link proves control of the mailbox, which is the one thing a stolen
 * session cannot supply.
 */
export const ACCOUNT_DELETION_TOKEN_TTL_HOURS = 24;

/**
 * How long an account must go untouched before it is considered abandoned.
 *
 * The clock only starts once there is nothing left to bill: an account with a
 * server is a customer with an unusual workflow, not an abandoned account, no
 * matter how long since they last opened the dashboard.
 */
export const ACCOUNT_INACTIVITY_MONTHS = 6;

/**
 * How long an abandoned account is given after being told.
 *
 * Longer than the grace period for a deletion someone asked for, because this
 * one arrives unrequested and has to survive a holiday.
 */
export const ACCOUNT_INACTIVITY_GRACE_PERIOD_DAYS = 30;

/** How long before the deadline the second notice goes out. */
export const ACCOUNT_INACTIVITY_REMINDER_DAYS = 7;

/**
 * When a declined renewal is charged again, in days from the first decline.
 *
 * Five attempts in all: the one that runs when the period falls due, then one
 * at each of these offsets. After the last of them declines, the ladder is out
 * of rungs and the subscription is suspended.
 *
 * The window is deliberately as long as the deletion grace period is short: a
 * card that fails on the 1st is very often a card that works on the 8th - a
 * replaced card, a topped-up account, a fraud hold cleared by a phone call -
 * and every rung is a customer who keeps their server instead of losing it to
 * a bank's Saturday. It stops at seven days because
 * `SERVER_DELETION_GRACE_PERIOD_DAYS` is what governs after that, and dunning
 * past the point where the machine is being deleted asks for money for
 * something that will not exist.
 *
 * Offsets from the first decline rather than gaps between attempts, because
 * that is the promise made to the customer in the emails: the schedule is
 * absolute, not a function of when a worker happened to run.
 */
export const RENEWAL_RETRY_SCHEDULE_DAYS = [1, 3, 5, 7] as const;

/**
 * How long a renewal may wait for the customer to authenticate before it is
 * treated as a declined attempt.
 *
 * 3-D Secure and a SEPA pre-notification both park a charge that nobody has
 * refused, so this is not a decline and does not spend a rung while it runs.
 * Three days is long enough to survive a weekend and short enough that the
 * ladder still has rungs left afterwards.
 */
export const RENEWAL_AUTHENTICATION_WINDOW_HOURS = 72;

/**
 * How long a server whose term has run out is left running while automatic
 * renewal is still trying to pay for it.
 *
 * `subscriptions.current_period_end` is written equal to `servers.terminates_at`,
 * so both fall due in the same instant and `suspend-terminated-servers` would
 * otherwise power the machine off within fifteen minutes — before the hourly
 * renewal sweep has even looked at it, and while the customer's card is
 * perfectly good. Worse, the suspension moves the subscription out of the only
 * statuses a claim accepts, so the renewal would never be attempted at all.
 *
 * Derived from the ladder rather than written down twice: it is one day past
 * the last rung, so a renewal system that has stopped running cannot hand out
 * unbounded free service. Once dunning gives up, the subscription leaves
 * `active`/`past_due` and the suspension sweep picks the server up on its very
 * next run.
 */
export const RENEWAL_SUSPENSION_GRACE_DAYS =
  Math.max(...RENEWAL_RETRY_SCHEDULE_DAYS) + 1;
