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

import { and, eq, isNull, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { apiKeys, sessions, users } from "@virtbase/db/schema";
import { FatalError } from "workflow";

type ClaimAccountStepParams = {
  userId: string;
};

/**
 * Takes ownership of an account's offboarding, and shuts the door behind it.
 *
 * Three jobs, and the order inside the transaction is the point:
 *
 * 1. Claim. `offboarding_started_at` is set only if it was null, so a second
 *    sweep passing over the same row finds it taken rather than destroying the
 *    same servers twice.
 * 2. Read. Name, email and locale are captured *now*, because the step that
 *    scrubs them runs before the one that sends the final email.
 * 3. Lock. Sessions and API keys go immediately, so nothing can order a new
 *    server halfway through the erasure of the account paying for it.
 */
export async function claimAccountStep({ userId }: ClaimAccountStepParams) {
  "use step";

  return db.transaction(
    async (tx) => {
      const claimed = await tx
        .update(users)
        .set({ offboardingStartedAt: sql`now()` })
        .where(and(eq(users.id, userId), isNull(users.offboardingStartedAt)))
        .returning({
          name: users.name,
          email: users.email,
          locale: users.locale,
          reason: users.deletionReason,
        })
        .then(([row]) => row);

      if (!claimed) {
        // Either the account is gone or another run already has it. Fatal
        // rather than retryable: waiting will not make it ours.
        throw new FatalError(
          `Offboarding for ${userId} is already under way or the account no longer exists.`,
        );
      }

      await Promise.all([
        tx.delete(sessions).where(eq(sessions.userId, userId)),
        tx.delete(apiKeys).where(eq(apiKeys.referenceId, userId)),
        // Not a punishment, a state: it stops sign-in while the account is
        // being taken apart. The row is scrubbed entirely a few steps later.
        tx
          .update(users)
          .set({ banned: true, banReason: "account_deletion_in_progress" })
          .where(eq(users.id, userId)),
      ]);

      return claimed;
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
}
