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
  LucideBookTemplate,
  LucideBuilding2,
  LucideGroup,
  LucideLayoutDashboard,
  LucideNetwork,
  LucideServer,
  LucideUsers,
} from "@virtbase/ui/icons";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@virtbase/ui/sidebar";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useExtracted } from "next-intl";
import { paths } from "@/lib/paths";

const useGroups = () => {
  const t = useExtracted();

  return [
    {
      label: t("Overview"),
      items: [
        {
          title: t("Dashboard"),
          path: paths.admin.home,
          icon: LucideLayoutDashboard,
        },
        {
          title: t("Users"),
          path: paths.admin.users,
          icon: LucideUsers,
        },
        {
          title: t("Servers"),
          path: paths.admin.servers,
          icon: LucideServer,
        },
      ],
    },
    {
      label: t("Proxmox VE"),
      items: [
        {
          title: t("Datacenters"),
          path: paths.admin.datacenters,
          icon: LucideBuilding2,
        },
        {
          title: t("Node Groups"),
          path: paths.admin.nodeGroups,
          icon: LucideGroup,
        },
        {
          title: t("Template Groups"),
          path: paths.admin.templateGroups,
          icon: LucideBookTemplate,
        },
      ],
    },
    {
      label: t("IPAM"),
      items: [
        {
          title: t("Subnets"),
          path: paths.admin.subnets,
          icon: LucideNetwork,
        },
      ],
    },
  ] as const;
};

export function AdminSidebarGroups() {
  const groups = useGroups();
  const pathname = usePathname();

  return groups.map(({ items, label }, index) => (
    <SidebarGroup key={index}>
      <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item, index) => (
            <SidebarMenuItem key={index}>
              <SidebarMenuButton
                asChild
                className="group/menu-button h-9 gap-3 font-medium text-muted-foreground group-data-[collapsible=icon]:px-[5px]! [&>svg]:size-auto"
                tooltip={item.title}
                isActive={
                  item.path.getHref() === "/"
                    ? pathname === item.path.getHref()
                    : pathname.startsWith(item.path.getHref())
                }
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
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
