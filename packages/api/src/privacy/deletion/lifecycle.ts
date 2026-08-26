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

import { and, eq, gt, isNull, sql } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { accountDeletionTokens, users } from "@virtbase/db/schema";
import {
  ACCOUNT_DELETION_GRACE_PERIOD_DAYS,
  ACCOUNT_DELETION_TOKEN_TTL_HOURS,
} from "@virtbase/utils";
import { createDeletionToken, hashDeletionToken } from "./tokens";

/**
 * Records that a customer has asked to be deleted, and mints the token that
 * will confirm it.
 *
 * Asking is not scheduling. Nothing is queued until the emailed token comes
 * back, because a session alone is what an attacker who borrowed a laptop
 * already has - control of the mailbox is the part they do not.
 *
 * Any previous unspent token is invalidated, so "send it again" cannot leave
 * two live links behind.
 */
export async function requestAccountDeletion({
  db,
  userId,
}: {
  db: typeof database;
  userId: string;
}) {
  const { token, tokenHash } = createDeletionToken();

  await db.transaction(
    async (tx) => {
      await tx
        .delete(accountDeletionTokens)
        .where(eq(accountDeletionTokens.userId, userId));

      await tx.insert(accountDeletionTokens).values({
        userId,
        tokenHash,
        expiresAt: new Date(
          Date.now() + ACCOUNT_DELETION_TOKEN_TTL_HOURS * 60 * 60 * 1000,
        ),
      });

      await tx
        .update(users)
        .set({
          deletionRequestedAt: sql`now()`,
          deletionReason: "user_request",
        })
        .where(eq(users.id, userId));
    },
    { accessMode: "read write", isolationLevel: "read committed" },
  );

  // The only time the plaintext exists outside the email.
  return { token };
}

/**
 * Spends a confirmation token and starts the grace period.
 *
 * Deliberately needs no session. Better Auth's own delete-account callback
 * requires one, which means its link only works in a browser that is still
 * signed in - useless for a mail opened on a phone. Here the token *is* the
 * proof, so the link works wherever the customer reads their mail.
 */
export async function confirmAccountDeletion({
  db,
  token,
}: {
  db: typeof database;
  token: string;
}): Promise<{ userId: string; scheduledAt: Date } | null> {
  const tokenHash = hashDeletionToken(token);

  return db.transaction(
    async (tx) => {
      const consumed = await tx
        .update(accountDeletionTokens)
        .set({ consumedAt: sql`now()` })
        .where(
          and(
            eq(accountDeletionTokens.tokenHash, tokenHash),
            // Single use, and only while live. Both conditions live in the
            // UPDATE rather than a read-then-write, so two clicks racing each
            // other cannot both win.
            isNull(accountDeletionTokens.consumedAt),
            gt(accountDeletionTokens.expiresAt, sql`now()`),
          ),
        )
        .returning({ userId: accountDeletionTokens.userId })
        .then(([row]) => row);

      if (!consumed) return null;

      const scheduledAt = new Date(
        Date.now() + ACCOUNT_DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
      );

      await tx
        .update(users)
        .set({
          deletionConfirmedAt: sql`now()`,
          deletionNotifiedAt: sql`now()`,
          deletionScheduledAt: scheduledAt,
        })
        .where(eq(users.id, consumed.userId));

      return { userId: consumed.userId, scheduledAt };
    },
    { accessMode: "read write", isolationLevel: "read committed" },
  );
}

/**
 * Calls the whole thing off.
 *
 * Reachable from the banner, and also from a password reset: someone
 * reclaiming a hijacked account should not additionally have to notice that a
 * deletion is pending. Refuses once offboarding has started, because by then
 * there are servers that no longer exist.
 */
export async function cancelAccountDeletion({
  db,
  userId,
}: {
  db: typeof database;
  userId: string;
}): Promise<boolean> {
  return db.transaction(
    async (tx) => {
      await tx
        .delete(accountDeletionTokens)
        .where(eq(accountDeletionTokens.userId, userId));

      const cleared = await tx
        .update(users)
        .set(CLEARED_DELETION_STATE)
        .where(and(eq(users.id, userId), isNull(users.offboardingStartedAt)))
        .returning({ id: users.id })
        .then(([row]) => row);

      return Boolean(cleared);
    },
    { accessMode: "read write", isolationLevel: "read committed" },
  );
}

/**
 * The lifecycle columns, blanked.
 *
 * Exported so the inactivity sweep can fold this into an update it is already
 * making, and so every caller forgets exactly the same set - a cancellation
 * that leaves `deletion_scheduled_at` behind is a deletion that still happens.
 */
export const CLEARED_DELETION_STATE = {
  deletionReason: null,
  deletionNotifiedAt: null,
  deletionRequestedAt: null,
  deletionConfirmedAt: null,
  deletionScheduledAt: null,
} as const satisfies Partial<typeof users.$inferInsert>;
