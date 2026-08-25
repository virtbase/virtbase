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

import Sentry from "@sentry/nextjs";
import { integrations } from "@virtbase/api/integrations";
import { connection, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

/**
 * Route configured in the Discord developer console which facilitates the
 * connection between Discord and any additional services you may use.
 * To start the flow, generate the OAuth2 consent dialog url for Discord,
 * and redirect the user there.
 */
export const GET = async () => {
  await connection();

  try {
    // Whether linked roles work at all is the integration's business, not the
    // environment's. An unconfigured or disabled integration is not an error —
    // the route simply does not exist yet.
    const discord = await integrations.resolve("identity", {
      integrationId: "discord",
    });
    if (!discord) {
      return new NextResponse("Not found", { status: 404 });
    }

    const { response, headers } = await auth.api.signInSocial({
      body: {
        provider: "discord",
        scopes: ["identify", "email", "role_connections.write"],
        requestSignUp: false,
      },
      returnHeaders: true,
    });

    if (response.url) {
      return NextResponse.redirect(response.url, { headers });
    }

    throw new Error("[@virtbase/discord] Failed to redirect to Discord login");
  } catch (error) {
    console.error(error);
    Sentry.captureException(error);

    return new NextResponse("Internal server error", { status: 500 });
  }
};
