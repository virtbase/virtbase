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

"use server";

import { buildExportDocument, collectSubjectData } from "@virtbase/api/privacy";
import { db } from "@virtbase/db/client";
import { CreateUserExportInputSchema } from "@virtbase/validators/admin";
import { actionClient } from "../../lib/action-client";

/**
 * Builds an admin copy of a customer's data export.
 *
 * The same builder and the same enumeration the customer's own export uses -
 * an access request answered by support and one answered by the self-service
 * page must not produce different documents. The only difference is the
 * absence of a passphrase, which makes this the tagged PDF/A-3a variant: an
 * archival copy rather than something travelling over the wire.
 */
export const createUserExportAction = actionClient
  .inputSchema(CreateUserExportInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { user: requester } = ctx;
    const { user_id: userId } = parsedInput;

    const data = await collectSubjectData({ db, userId });

    const pdf = await buildExportDocument({
      data,
      // Deliberately empty. Fetching every invoice PDF is a call to the
      // accounting provider each, which belongs in the customer's background
      // build rather than in an admin's click.
      invoices: [],
      locale: requester.locale,
    });

    // [!] Base64, not a `Blob`.
    //
    // A server action's return value has to be JSON-serialisable - a `Blob`
    // survives the trip as `{}`, and the download then fails silently in the
    // client's success handler rather than erroring anywhere visible. The
    // invoice download endpoint hands binary over the wire the same way.
    return {
      filename: `${userId}.pdf`,
      content_type: "application/pdf",
      content: Buffer.from(pdf).toString("base64"),
    };
  });
