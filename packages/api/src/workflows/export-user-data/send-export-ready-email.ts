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
import DataExportReady from "@virtbase/email/templates/data-export-ready";
import { getEmailTitle } from "@virtbase/email/translations";
import { getStepMetadata } from "workflow";

type SendExportReadyEmailStepParams = {
  exportId: string;
  user: {
    name: string;
    email: string;
    locale?: string | null;
  };
  byteSize: number;
};

export async function sendExportReadyEmailStep({
  exportId,
  user,
  byteSize,
}: SendExportReadyEmailStepParams) {
  "use step";

  const { stepId } = getStepMetadata();

  await sendEmail(
    {
      to: user.email,
      subject: await getEmailTitle("data-export-ready", user.locale),
      react: await DataExportReady({
        email: user.email,
        name: user.name,
        locale: user.locale,
        exportId,
        byteSize,
      }),
    },
    {
      idempotencyKey: stepId,
    },
  );
}
