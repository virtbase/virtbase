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

import { cn } from "@virtbase/ui";
import { Button } from "@virtbase/ui/button";
import { getExtracted } from "next-intl/server";
import type { ReactNode } from "react";

import { IntlLink } from "@/i18n/navigation.public";
import DiscordBotDemo from "./discord-bot-demo";
import ServerFirewallDemo from "./server-firewall-demo";
import ServerStatsDemo from "./server-stats-demo";

/**
 * The interactive previews a feature can show. Named rather than passed as a
 * component so MDX stays declarative and cannot import arbitrary React.
 */
const demos = {
  "server-stats": ServerStatsDemo,
  "server-firewall": ServerFirewallDemo,
  "discord-bot": DiscordBotDemo,
} as const;

export type FeatureDemo = keyof typeof demos;

/**
 * One cell of `<Features>`: a demo, a heading, and the prose written as the
 * component's MDX body.
 */
export async function Feature({
  title,
  demo,
  href,
  wide,
  children,
}: {
  title: string;
  demo: FeatureDemo;
  /** Optional target for the "Learn more" button. */
  href?: string;
  /**
   * Take the full width of the showcase instead of one column. For a demo that
   * is laid out horizontally and would be squeezed into a single cell.
   */
  wide?: boolean;
  children?: ReactNode;
}) {
  const t = await getExtracted();
  const Demo = demos[demo];

  return (
    <div
      className={cn(
        "relative flex flex-col gap-10 px-4 py-6 sm:px-10 sm:py-14",
        wide && "md:col-span-2 md:border-grid-border md:border-t md:border-l-0",
      )}
    >
      <div
        className={cn(
          "relative px-0 pt-px lg:px-0",
          !wide &&
            "mask-[linear-gradient(black_50%,transparent)] h-72 overflow-hidden sm:h-72.5",
        )}
      >
        <Demo inert />
      </div>
      <div className="relative flex flex-col text-base">
        <h3 className="font-semibold">{title}</h3>
        <div className="mt-1 text-muted-foreground transition-colors [&_a]:font-medium [&_a]:text-foreground/80 [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2 hover:[&_a]:text-foreground">
          {children}
        </div>
        {href && (
          <Button variant="outline" size="sm" asChild>
            <IntlLink href={href} prefetch={false} className="mt-3 w-fit">
              {t("Learn more")}
            </IntlLink>
          </Button>
        )}
      </div>
    </div>
  );
}
