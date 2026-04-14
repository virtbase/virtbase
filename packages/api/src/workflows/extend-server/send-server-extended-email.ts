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
import ServerExtended from "@virtbase/email/templates/server-extended";
import { getEmailTitle } from "@virtbase/email/translations";
import { getStepMetadata } from "workflow";

type SendServerExtendedEmailStepParams = {
  user: {
    name: string;
    email: string;
    locale?: string | null;
  };
  serverName: string;
  newTerminatesAt: Date;
};

export async function sendServerExtendedEmailStep(
  params: SendServerExtendedEmailStepParams,
) {
  "use step";

  const { user, serverName, newTerminatesAt } = params;
  const { stepId } = getStepMetadata();

  await sendEmail(
    {
      to: user.email,
      subject: await getEmailTitle("server-extended", user.locale),
      react: await ServerExtended({
        email: user.email,
        name: user.name,
        locale: user.locale,
        newTerminatesAt,
        serverName,
      }),
    },
    {
      idempotencyKey: stepId,
    },
  );
}
