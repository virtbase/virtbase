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

import { getDiscordBotInfo } from "@virtbase/api/integrations";
import { Button } from "@virtbase/ui/button";
import { Card, CardContent } from "@virtbase/ui/card";
import {
  Discord,
  LucideArrowUpRight,
  LucideBookOpen,
} from "@virtbase/ui/icons";
import { PUBLIC_DOMAIN } from "@virtbase/utils";
import NextLink from "next/link";
import { connection } from "next/server";
import { getExtracted, getLocale } from "next-intl/server";

/**
 * Advertises the Discord bot on the page where an account is linked to Discord.
 *
 * This is the moment a customer is already thinking about their Discord
 * account, which is the only reason the card is here rather than on a page of
 * its own. Linking is what the bot needs to recognise them, and the two live
 * one section apart.
 *
 * Renders nothing when the integration is off — there is no bot to add, and an
 * invite link built from a missing application id would 404 on Discord.
 */
export async function DiscordBotCard() {
  await connection();

  const bot = await getDiscordBotInfo();
  if (!bot) return null;

  const t = await getExtracted();
  const locale = await getLocale();

  return (
    <Card className="overflow-hidden border-[#5865F2]/30 bg-[#5865F2]/5">
      <CardContent className="flex @2xl:flex-row flex-col @2xl:items-center @2xl:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#5865F2]">
            <Discord className="size-6 text-white" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-sm">
              {t("Manage your servers from Discord")}
            </p>
            <p className="text-muted-foreground text-sm">
              {t(
                "Start and stop servers, take backups, edit firewall rules and open a console — without leaving chat. Link your Discord account below, then run /menu.",
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" asChild>
            <NextLink
              href={`${PUBLIC_DOMAIN}/${locale}/help/article/discord-integration`}
              prefetch={false}
            >
              <LucideBookOpen aria-hidden="true" />
              {t("Guide")}
            </NextLink>
          </Button>
          <Button size="sm" asChild>
            <a href={bot.inviteUrl} target="_blank" rel="noreferrer noopener">
              {t("Add to Discord")}
              <LucideArrowUpRight aria-hidden="true" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
