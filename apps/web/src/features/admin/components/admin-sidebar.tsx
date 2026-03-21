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

import { Logo } from "@virtbase/ui/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
} from "@virtbase/ui/sidebar";
import NextLink from "next/link";
import { useExtracted } from "next-intl";
import { AdminSidebarGroups } from "@/features/admin/components/admin-sidebar-groups";
import { LocaleSwitcher } from "@/ui/locale-switcher";
import { NavUser } from "@/ui/nav-user";

export function AdminSidebar() {
  const t = useExtracted();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="mb-2 h-16 justify-center max-md:mt-2">
        {/* Logo */}
        <div className="flex gap-2 px-2 transition-[padding] duration-200 ease-in-out group-data-[collapsible=icon]:px-0">
          <NextLink
            href="/"
            className="group/logo inline-flex"
            prefetch={false}
          >
            <span className="sr-only">{t("Logo")}</span>
            <div className="size-9 transition-[width,height] duration-200 ease-in-out group-data-[collapsible=icon]:size-8">
              <Logo className="size-full" />
            </div>
          </NextLink>
        </div>
      </SidebarHeader>
      <SidebarContent className="-mt-2">
        <AdminSidebarGroups />
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
            {t("Language")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <LocaleSwitcher />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
