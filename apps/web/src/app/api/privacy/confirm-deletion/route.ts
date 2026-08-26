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

import { confirmAccountDeletion } from "@virtbase/api/privacy";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";
import { sendEmail } from "@virtbase/email";
import AccountDeletionScheduled from "@virtbase/email/templates/account-deletion-scheduled";
import { getEmailTitle } from "@virtbase/email/translations";
import { APP_DOMAIN } from "@virtbase/utils";
import type { NextRequest } from "next/server";

/**
 * Completes a deletion request from the emailed link.
 *
 * [!] Deliberately requires no session. Better Auth's own delete-account
 * callback calls `getSessionFromCtx` and 404s without one, which means its
 * link only works in a browser still signed in as that user - useless for a
 * mail opened on a phone, and it weakens the guarantee we actually want. The
 * token is the proof; the session is irrelevant to it.
 *
 * A GET that mutates, because that is what a link in an email is. The token is
 * single-use and high-entropy, so a prefetching mail client can spend it - but
 * spending it only schedules a deletion the customer just asked for, sends
 * them a dated warning, and leaves a cancel button live for two weeks.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  const redirect = (status: "confirmed" | "invalid") =>
    Response.redirect(
      `${APP_DOMAIN}/account/settings/privacy?deletion=${status}`,
      303,
    );

  if (!token) return redirect("invalid");

  const result = await confirmAccountDeletion({ db, token });
  if (!result) return redirect("invalid");

  const account = await db
    .select({
      name: users.name,
      email: users.email,
      locale: users.locale,
    })
    .from(users)
    .where(eq(users.id, result.userId))
    .limit(1)
    .then(([row]) => row);

  if (account) {
    await sendEmail({
      to: account.email,
      subject: await getEmailTitle(
        "account-deletion-scheduled",
        account.locale,
        { date: result.scheduledAt },
      ),
      react: await AccountDeletionScheduled({
        email: account.email,
        name: account.name,
        locale: account.locale,
        scheduledAt: result.scheduledAt,
      }),
    });
  }

  return redirect("confirmed");
}
