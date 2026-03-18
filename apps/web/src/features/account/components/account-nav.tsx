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
  LucideCreditCard,
  LucideLock,
  LucideTerminal,
  LucideUser,
  LucideUserKey,
} from "@virtbase/ui/icons";
import { ScrollArea } from "@virtbase/ui/scroll-area";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useExtracted } from "next-intl";
import { paths } from "@/lib/paths";

const useItems = () => {
  const t = useExtracted();

  return [
    {
      title: t("General"),
      path: paths.app.account.settings,
      icon: LucideUser,
    },
    {
      title: t("Security"),
      path: paths.app.account.settings.authentication,
      icon: LucideLock,
    },
    {
      title: t("Billing"),
      path: paths.app.account.settings.billing,
      icon: LucideCreditCard,
    },
    {
      title: t("API"),
      path: paths.app.account.settings.api,
      icon: LucideTerminal,
    },
    {
      title: t("SSH Keys"),
      path: paths.app.account.settings.sshKeys,
      icon: LucideUserKey,
    },
  ] as const;
};

export function AccountNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const pathname = usePathname();
  const items = useItems();

  return (
    <ScrollArea>
      <nav
        className={cn("flex w-full flex-row gap-1 max-md:flex-wrap", className)}
        {...props}
      >
        {items.map((item) => (
          <NextLink
            key={item.title}
            href={item.path.getHref()}
            prefetch={false}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "text-muted-foreground hover:text-foreground",
              pathname === item.path.getHref() &&
                "text-foreground [&>svg]:text-primary",
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
