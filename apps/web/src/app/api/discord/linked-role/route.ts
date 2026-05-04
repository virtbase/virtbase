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
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * Route configured in the Discord developer console which facilitates the
 * connection between Discord and any additional services you may use.
 * To start the flow, generate the OAuth2 consent dialog url for Discord,
 * and redirect the user there.
 */
export const GET = async () => {
  try {
    const { DISCORD_APP_ID, DISCORD_BOT_TOKEN } = process.env;
    if (!DISCORD_APP_ID || !DISCORD_BOT_TOKEN) {
      throw new Error(
        "[@virtbase/discord] DISCORD_APP_ID or DISCORD_BOT_TOKEN is not set. Linked role integration can only be used if both are set.",
      );
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
