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

import { sendEmail } from "@virtbase/email";
import AccountDeleted from "@virtbase/email/templates/account-deleted";
import { getEmailTitle } from "@virtbase/email/translations";
import { getStepMetadata } from "workflow";

type SendAccountDeletedEmailStepParams = {
  user: {
    name: string;
    email: string;
    locale?: string | null;
  };
  reason: "inactivity" | "user_request" | "admin_request";
};

/**
 * The final message, sent to an address the database no longer holds.
 *
 * Everything it needs was captured when the account was claimed, precisely
 * because by this point the row has been scrubbed and could not tell us where
 * to write.
 */
export async function sendAccountDeletedEmailStep({
  user,
  reason,
}: SendAccountDeletedEmailStepParams) {
  "use step";

  const { stepId } = getStepMetadata();

  await sendEmail(
    {
      to: user.email,
      subject: await getEmailTitle("account-deleted", user.locale),
      react: await AccountDeleted({
        email: user.email,
        name: user.name,
        locale: user.locale,
        reason,
      }),
    },
    {
      idempotencyKey: stepId,
    },
  );
}
