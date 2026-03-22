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
import { sendEmail } from "@virtbase/email";
import ServerReady from "@virtbase/email/templates/server-ready";
import { getEmailTitle } from "@virtbase/email/translations";
import { FatalError, getStepMetadata } from "workflow";

type SendServerReadyEmailStepParams = {
  userId: string;
  serverId: string;
  initialRootPassword?: string | null;
  sshKeyApplied?: boolean;
};

export async function sendServerReadyEmailStep({
  userId,
  serverId,
  initialRootPassword,
}: SendServerReadyEmailStepParams) {
  "use step";

  const { stepId } = getStepMetadata();

  const user = await db.transaction(
    async (tx) => {
      return tx
        .select({
          name: users.name,
          email: users.email,
          locale: users.locale,
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
    throw new FatalError(
      `The user with ID "${userId}" was not found. Cannot send server ready email.`,
    );
  }

  await sendEmail(
    {
      to: user.email,
      subject: getEmailTitle("server-ready", user.locale),
      react: ServerReady({
        email: user.email,
        name: user.name,
        locale: user.locale,
        serverId,
        rootPassword: initialRootPassword,
        rootUsername: "root",
        trustpilot: {
          recipientName: user.name,
          referenceId: serverId,
        },
      }),
      trustpilotAfs: true,
    },
    {
      idempotencyKey: stepId,
    },
  );
}
