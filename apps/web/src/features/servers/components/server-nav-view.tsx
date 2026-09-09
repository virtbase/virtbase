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

"use client";

import { cn } from "@virtbase/ui";
import { buttonVariants } from "@virtbase/ui/button";
import {
  LucideBrickWallFire,
  LucideCreditCard,
  LucideDatabaseBackup,
  LucideGlobe,
  LucideLayoutDashboard,
  LucideTerminalSquare,
  LucideWrench,
} from "@virtbase/ui/icons";
import { ScrollArea } from "@virtbase/ui/scroll-area";
import NextLink from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useExtracted } from "next-intl";
import { paths } from "@/lib/paths";

/**
 * The tab bar itself, rendered identically whether or not the server's id is
 * known yet.
 *
 * Only the `href` needs the id. The labels, the icons and which tab is
 * highlighted do not - `useSelectedLayoutSegment()` is fixed for each
 * prerendered page - so with `serverId` still unresolved this renders the same
 * seven buttons in the same places, merely not yet clickable. That is what lets
 * the Suspense fallback be the finished nav rather than a skeleton, so nothing
 * moves when the id arrives.
 */
export function ServerNavView({ serverId }: { serverId: string | null }) {
  const t = useExtracted();
  const segment = useSelectedLayoutSegment();

  const items = [
    {
      title: t("Overview"),
      value: "overview",
      href: paths.app.servers.overview.getHref,
      icon: LucideLayoutDashboard,
    },
    {
      title: t("Console"),
      value: "console",
      href: paths.app.servers.console.getHref,
      icon: LucideTerminalSquare,
    },
    {
      title: t("Firewall"),
      value: "firewall",
      href: paths.app.servers.firewall.getHref,
      icon: LucideBrickWallFire,
    },
    {
      title: t("Backups"),
      value: "backups",
      href: paths.app.servers.backups.getHref,
      icon: LucideDatabaseBackup,
    },
    {
      title: t("rDNS"),
      value: "rdns",
      href: paths.app.servers.rdns.getHref,
      icon: LucideGlobe,
    },
    {
      title: t("Advanced"),
      value: "advanced",
      href: paths.app.servers.advanced.getHref,
      icon: LucideWrench,
    },
    {
      title: t("Plan"),
      value: "plan",
      href: paths.app.servers.plan.getHref,
      icon: LucideCreditCard,
    },
  ] as const;

  return (
    <ScrollArea>
      <nav className="flex w-full flex-row gap-1 max-md:flex-wrap">
        {items.map((item) => {
          const className = cn(
            buttonVariants({ variant: "outline" }),
            "text-muted-foreground hover:text-foreground",
            segment === item.value && "text-foreground [&>svg]:text-primary",
          );
          const content = (
            <>
              <item.icon size={20} strokeWidth={1.5} aria-hidden />
              {item.title}
            </>
          );

          return serverId === null ? (
            <span key={item.value} aria-disabled className={className}>
              {content}
            </span>
          ) : (
            <NextLink
              key={item.value}
              href={item.href(serverId)}
              prefetch={false}
              className={className}
            >
              {content}
            </NextLink>
          );
        })}
      </nav>
    </ScrollArea>
  );
}
