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

import { eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  accountDeletionTokens,
  accounts,
  apiKeys,
  dataExports,
  emails,
  orders,
  passkeys,
  sessions,
  sshKeys,
  twoFactors,
  users,
  verifications,
} from "@virtbase/db/schema";
import { FatalError } from "workflow";

type AnonymizeUserStepParams = {
  userId: string;
  /** Captured before anything was scrubbed, so the mail archive can be found. */
  email: string;
};

/**
 * The terminal write. One transaction, and after it the row is no longer
 * personal data.
 *
 * Anonymisation rather than deletion, and not for want of trying: `invoices`,
 * `orders` and `payments` all cascade from `users.id`, so a `DELETE` would
 * take the accounting record the tax office requires along with the person.
 * Keeping the row as a keyless husk satisfies both - erasure under Article 17
 * and retention under German commercial law - and Recital 26 is what makes
 * that legitimate: anonymised data is not personal data.
 *
 * Everything not under a retention obligation is deleted outright around it.
 */
export async function anonymizeUserStep({
  userId,
  email,
}: AnonymizeUserStepParams) {
  "use step";

  return db.transaction(
    async (tx) => {
      // Deterministic, unique, and unroutable. `users.email` carries a unique
      // index, so the tombstone cannot simply be a constant - and `.invalid`
      // is reserved by RFC 2606 precisely so it can never resolve.
      const tombstone = `deleted+${userId}@invalid`;

      const [
        deletedSessions,
        deletedAccounts,
        deletedPasskeys,
        deletedTwoFactors,
        deletedApiKeys,
        deletedSshKeys,
      ] = await Promise.all([
        tx
          .delete(sessions)
          .where(eq(sessions.userId, userId))
          .returning({ id: sessions.id }),
        tx
          .delete(accounts)
          .where(eq(accounts.userId, userId))
          .returning({ id: accounts.id }),
        tx
          .delete(passkeys)
          .where(eq(passkeys.userId, userId))
          .returning({ id: passkeys.id }),
        tx
          .delete(twoFactors)
          .where(eq(twoFactors.userId, userId))
          .returning({ id: twoFactors.id }),
        tx
          .delete(apiKeys)
          .where(eq(apiKeys.referenceId, userId))
          .returning({ id: apiKeys.id }),
        tx
          .delete(sshKeys)
          .where(eq(sshKeys.userId, userId))
          .returning({ id: sshKeys.id }),
      ]);

      await Promise.all([
        // Keyed by address rather than by user id, so this is the last moment
        // the archive can be found at all.
        tx.delete(verifications).where(eq(verifications.identifier, email)),
        tx
          .delete(accountDeletionTokens)
          .where(eq(accountDeletionTokens.userId, userId)),
        // An export is a complete dossier on the person being erased. It goes,
        // bytes and all.
        tx.delete(dataExports).where(eq(dataExports.userId, userId)),
      ]);

      // Retained as booking documents, but not with a home address and an SSH
      // public key inside them. `rootPasswordCiphertext` is already cleared at
      // provisioning; this is belt and braces for orders that never got there.
      const scrubbedOrders = await tx
        .update(orders)
        .set({
          billingAddress: null,
          rootPasswordCiphertext: null,
          configuration: sql`
            (${orders.configuration}::jsonb - 'new_ssh_key' - 'ssh_key_id' - 'root_password')
          `,
        })
        .where(eq(orders.userId, userId))
        .returning({ id: orders.id });

      // The bodies of every message we sent. Subject and timestamp stay: some
      // of these are commercial letters with a retention period of their own,
      // and the subject line is what makes the record meaningful.
      const redactedEmails = await tx
        .update(emails)
        .set({ html: null, text: null })
        .where(eq(emails.to, [email]))
        .returning({ id: emails.id });

      const anonymized = await tx
        .update(users)
        .set({
          name: "Deleted user",
          email: tombstone,
          emailVerified: false,
          image: null,
          locale: null,
          stripeCustomerId: null,
          twoFactorEnabled: false,
          lastSeenAt: null,
          banReason: "account_deleted",
          anonymizedAt: sql`now()`,
        })
        .where(eq(users.id, userId))
        .returning({ id: users.id })
        .then(([row]) => row);

      if (!anonymized) {
        throw new FatalError(
          `Could not anonymise ${userId}: the row disappeared mid-erasure.`,
        );
      }

      return {
        sessions: deletedSessions.length,
        linkedAccounts: deletedAccounts.length,
        passkeys: deletedPasskeys.length,
        twoFactors: deletedTwoFactors.length,
        apiKeys: deletedApiKeys.length,
        sshKeys: deletedSshKeys.length,
        scrubbedOrders: scrubbedOrders.length,
        redactedEmails: redactedEmails.length,
      };
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
}
