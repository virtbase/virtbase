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

import {
  LayoutDashboardIcon,
  ListIcon,
  LucideServer,
} from "@virtbase/ui/icons";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@virtbase/ui/sidebar";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useExtracted } from "next-intl";
import { paths } from "@/lib/paths";

const useItems = () => {
  const t = useExtracted();

  return [
    {
      title: t("Dashboard"),
      path: paths.app.home,
      icon: LayoutDashboardIcon,
    },
    {
      title: t("Servers"),
      path: paths.app.servers,
      icon: LucideServer,
    },
    {
      title: t("Invoices"),
      path: paths.app.invoices,
      icon: ListIcon,
    },
  ] as const;
};

export function AppSidebarMenu() {
  const pathname = usePathname();
  const items = useItems();

  return (
    <SidebarMenu>
      {items.map((item, index) => {
        const href = item.path.getHref();
        const isActive =
          href === "/" ? pathname === href : pathname.startsWith(href);

        return (
          <SidebarMenuItem key={index}>
            <SidebarMenuButton
              asChild
              className="group/menu-button h-9 gap-3 font-medium text-muted-foreground group-data-[collapsible=icon]:px-[5px]! [&>svg]:size-auto"
              tooltip={item.title}
              isActive={isActive}
            >
              <NextLink href={item.path.getHref()} prefetch={false}>
                <item.icon
                  className="text-muted-foreground/65 group-data-[active=true]/menu-button:text-primary"
                  size={22}
                  aria-hidden="true"
                />
                <span>{item.title}</span>
              </NextLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
