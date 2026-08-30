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
import { and, desc, eq, gte, sql } from "@virtbase/db";
import {
  dataExports,
  servers as serversTable,
  users,
} from "@virtbase/db/schema";
import { sendEmail } from "@virtbase/email";
import AccountDeletionCancelled from "@virtbase/email/templates/account-deletion-cancelled";
import AccountDeletionRequested from "@virtbase/email/templates/account-deletion-requested";
import { getEmailTitle } from "@virtbase/email/translations";
import {
  APP_DOMAIN,
  DATA_EXPORT_MIN_INTERVAL_HOURS,
  DATA_EXPORT_PASSPHRASE_LENGTH,
  DATA_EXPORT_TTL_DAYS,
  generatePassword,
} from "@virtbase/utils";
import { start } from "workflow/api";
import * as z from "zod";
import { getDeletionBlockers, hasBlockers } from "../privacy/deletion/blockers";
import {
  cancelAccountDeletion,
  requestAccountDeletion,
} from "../privacy/deletion/lifecycle";
import { revokeStepUp } from "../step-up/marker";
import { protectedProcedure, stepUpProcedure } from "../trpc";
import { exportUserDataWorkflow } from "../workflows/export-user-data";

export const privacyRouter = {
  /**
   * Asks for a copy of everything we hold.
   *
   * Behind step-up because an export is a complete dossier on a person: a
   * borrowed session should not be able to produce one and mail itself the
   * link.
   */
  requestExport: stepUpProcedure
    .meta({
      ratelimit: {
        requests: 3,
        seconds: "1 h",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `request-export:${userId || defaultFingerprint}`,
      },
    })
    .mutation(async ({ ctx }) => {
      const { db, userId, session } = ctx;

      const recent = await db
        .select({ id: dataExports.id })
        .from(dataExports)
        .where(
          and(
            eq(dataExports.userId, userId),
            gte(
              dataExports.createdAt,
              sql`now() - INTERVAL '${sql.raw(`${DATA_EXPORT_MIN_INTERVAL_HOURS}`)} hours'`,
            ),
          ),
        )
        .limit(1)
        .then(([row]) => row);

      if (recent) {
        // Article 12(5) allows refusing a manifestly excessive repeat request,
        // and every export costs one call to the accounting provider per
        // invoice.
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "EXPORT_ALREADY_REQUESTED",
        });
      }

      const passphrase = generatePassword(DATA_EXPORT_PASSPHRASE_LENGTH);

      const created = await db
        .insert(dataExports)
        .values({
          userId,
          expiresAt: new Date(
            Date.now() + DATA_EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000,
          ),
        })
        .returning({ id: dataExports.id })
        .then(([row]) => row);

      if (!created) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      await start(exportUserDataWorkflow, [
        { exportId: created.id, passphrase },
      ]);

      // Spend the re-authentication. One challenge authorises one export, not
      // everything the customer clicks in the next ten minutes.
      if (session) await revokeStepUp(session.session.token);

      return {
        exportId: created.id,
        /**
         * [!] The only time this is ever returned. It is not stored anywhere it
         * could be read back, and it is not in the email - so a customer who
         * loses it requests a new export rather than recovering this one.
         */
        passphrase,
      };
    }),

  /**
   * The customer's most recent export, for the page that polls while one is
   * being built.
   */
  latestExport: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const { db, userId } = ctx;

      const latest = await db
        .select({
          id: dataExports.id,
          status: dataExports.status,
          byte_size: dataExports.byteSize,
          failure_reason: dataExports.failureReason,
          downloaded_at: dataExports.downloadedAt,
          expires_at: dataExports.expiresAt,
          completed_at: dataExports.completedAt,
          created_at: dataExports.createdAt,
        })
        .from(dataExports)
        .where(eq(dataExports.userId, userId))
        .orderBy(desc(dataExports.createdAt))
        .limit(1)
        .then(([row]) => row);

      return { export: latest ?? null };
    }),

  /**
   * What stands between this customer and deleting their account.
   *
   * Read by the danger zone so the consequences and the refusals are both on
   * screen before anything is typed, rather than arriving as an error after
   * the decision has been made.
   */
  deletionStatus: protectedProcedure.query(async ({ ctx }) => {
    const { db, userId } = ctx;

    const [blockers, account] = await Promise.all([
      getDeletionBlockers({ db, userId }),
      db
        .select({
          requested_at: users.deletionRequestedAt,
          confirmed_at: users.deletionConfirmedAt,
          scheduled_at: users.deletionScheduledAt,
          offboarding_started_at: users.offboardingStartedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(([row]) => row),
    ]);

    const servers = await db.$count(
      serversTable,
      eq(serversTable.userId, userId),
    );

    return {
      blockers,
      blocked: hasBlockers(blockers),
      // Not a blocker - the count is here so the dialog can say exactly how
      // many machines are about to be destroyed.
      servers,
      requested_at: account?.requested_at ?? null,
      confirmed_at: account?.confirmed_at ?? null,
      scheduled_at: account?.scheduled_at ?? null,
      in_progress: Boolean(account?.offboarding_started_at),
    };
  }),

  /**
   * Starts a deletion. Sends the link; schedules nothing.
   */
  requestDeletion: stepUpProcedure
    .meta({
      ratelimit: {
        requests: 3,
        seconds: "1 h",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `request-deletion:${userId || defaultFingerprint}`,
      },
    })
    .mutation(async ({ ctx }) => {
      const { db, userId, session } = ctx;

      const blockers = await getDeletionBlockers({ db, userId });
      if (hasBlockers(blockers)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "DELETION_BLOCKED",
        });
      }

      const account = await db
        .select({
          name: users.name,
          email: users.email,
          locale: users.locale,
          offboardingStartedAt: users.offboardingStartedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(([row]) => row);

      if (!account || account.offboardingStartedAt) {
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      }

      const { token } = await requestAccountDeletion({ db, userId });

      await sendEmail({
        to: account.email,
        subject: await getEmailTitle(
          "account-deletion-requested",
          account.locale,
        ),
        react: await AccountDeletionRequested({
          email: account.email,
          name: account.name,
          locale: account.locale,
          url: `${APP_DOMAIN}/api/privacy/confirm-deletion?token=${token}`,
        }),
      });

      // One challenge authorises one request.
      if (session) await revokeStepUp(session.session.token);

      return { sent: true };
    }),

  /**
   * Calls off a pending deletion.
   *
   * No step-up. Stopping something destructive should never be harder than
   * starting it, and the worst an attacker achieves here is leaving the
   * customer with the account they already had.
   */
  cancelDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    const { db, userId } = ctx;

    const cancelled = await cancelAccountDeletion({ db, userId });

    if (!cancelled) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "DELETION_ALREADY_IN_PROGRESS",
      });
    }

    const account = await db
      .select({
        name: users.name,
        email: users.email,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then(([row]) => row);

    if (account) {
      // The cancellation is already committed. `sendEmail` rejects on a
      // provider failure, and failing the mutation over a courtesy notice
      // would tell the customer their deletion is still scheduled when it is
      // not - the more alarming of the two wrong answers.
      try {
        await sendEmail({
          to: account.email,
          subject: await getEmailTitle(
            "account-deletion-cancelled",
            account.locale,
          ),
          react: await AccountDeletionCancelled({
            email: account.email,
            name: account.name,
            locale: account.locale,
          }),
        });
      } catch (error) {
        console.error(
          "[@virtbase/api] Failed to send the deletion-cancelled notice: ",
          error,
        );
        Sentry.captureException(error);
      }
    }

    return { cancelled: true };
  }),
} satisfies TRPCRouterRecord;
