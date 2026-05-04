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
import {
  createDiscordCaller,
  getInteractionHandler,
  getUserByInteraction,
  verifyInteractionRequest,
} from "@virtbase/discord";
import { NextResponse } from "next/server";

const DISCORD_APP_PUBLIC_KEY = process.env.DISCORD_APP_PUBLIC_KEY;

export async function POST(request: Request) {
  if (!DISCORD_APP_PUBLIC_KEY) {
    return new NextResponse("DISCORD_APP_PUBLIC_KEY is not in the .env.", {
      status: 500,
    });
  }

  const verifyResult = await verifyInteractionRequest(
    request,
    DISCORD_APP_PUBLIC_KEY,
  );

  if (!verifyResult.isValid || !verifyResult.interaction) {
    return new NextResponse("Invalid request.", { status: 401 });
  }

  const { interaction } = verifyResult;

  try {
    const handler = getInteractionHandler(interaction.type);

    const user = await getUserByInteraction(interaction);
    const caller = await createDiscordCaller({ user });

    const result = await handler({ interaction, user, caller });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error(error);

    Sentry.captureException(error, {
      tags: {
        "discord.interaction.error": "true",
        "discord.interaction.id": interaction.id,
        "discord.interaction.type": interaction.type,
      },
    });

    return new NextResponse("Failed to handle interaction.", {
      status: 500,
    });
  }
}
