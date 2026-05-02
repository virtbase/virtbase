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
import { useParams, useSelectedLayoutSegment } from "next/navigation";
import { useExtracted } from "next-intl";
import { paths } from "@/lib/paths";

const useItems = () => {
  const t = useExtracted();
  const { id: kvmId } = useParams<{ id: string }>();

  return [
    {
      title: t("Overview"),
      value: "overview",
      path: paths.app.servers.overview.getHref(kvmId),
      icon: LucideLayoutDashboard,
    },
    {
      title: t("Console"),
      value: "console",
      path: paths.app.servers.console.getHref(kvmId),
      icon: LucideTerminalSquare,
    },
    {
      title: t("Firewall"),
      value: "firewall",
      path: paths.app.servers.firewall.getHref(kvmId),
      icon: LucideBrickWallFire,
    },
    {
      title: t("Backups"),
      value: "backups",
      path: paths.app.servers.backups.getHref(kvmId),
      icon: LucideDatabaseBackup,
    },
    {
      title: t("rDNS"),
      value: "rdns",
      path: paths.app.servers.rdns.getHref(kvmId),
      icon: LucideGlobe,
    },
    {
      title: t("Advanced"),
      value: "advanced",
      path: paths.app.servers.advanced.getHref(kvmId),
      icon: LucideWrench,
    },
    {
      title: t("Plan"),
      value: "plan",
      path: paths.app.servers.plan.getHref(kvmId),
      icon: LucideCreditCard,
    },
  ] as const;
};

export function ServerNav() {
  const segment = useSelectedLayoutSegment();
  const items = useItems();

  return (
    <ScrollArea>
      <nav className="flex w-full flex-row gap-1 max-md:flex-wrap">
        {items.map((item) => (
          <NextLink
            key={item.title}
            href={item.path}
            prefetch={false}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "text-muted-foreground hover:text-foreground",
              segment === item.value && "text-foreground [&>svg]:text-primary",
            )}
          >
            <item.icon size={20} strokeWidth={1.5} aria-hidden />
            {item.title}
          </NextLink>
        ))}
      </nav>
    </ScrollArea>
  );
}
