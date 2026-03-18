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

import { LucideLifeBuoy } from "@virtbase/ui/icons";
import { Logo } from "@virtbase/ui/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@virtbase/ui/sidebar";
import NextLink from "next/link";
import { useExtracted } from "next-intl";
import { AppSidebarMenu } from "@/ui/app-sidebar-menu";
import FeedbackButton from "@/ui/feedback-button";
import { LocaleSwitcher } from "@/ui/locale-switcher";
import { NavUser } from "@/ui/nav-user";

export function AppSidebar() {
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
            <span className="sr-only">Logo</span>
            <div className="size-9 transition-[width,height] duration-200 ease-in-out group-data-[collapsible=icon]:size-8">
              <Logo className="size-full" />
            </div>
          </NextLink>
        </div>
      </SidebarHeader>
      <SidebarContent className="-mt-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
            {t("Overview")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <AppSidebarMenu />
          </SidebarGroupContent>
        </SidebarGroup>
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
        <SidebarMenu>
          <SidebarMenuItem>
            <FeedbackButton />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip={t("Support")}
              className="group/menu-button h-9 gap-3 font-medium text-muted-foreground group-data-[collapsible=icon]:px-[5px]! [&>svg]:size-auto"
            >
              <a
                href="mailto:support@virtbase.com"
                target="_blank"
                rel="noopener"
              >
                <LucideLifeBuoy
                  className="text-muted-foreground/65 group-data-[active=true]/menu-button:text-primary"
                  size={22}
                  aria-hidden="true"
                />
                <span>{t("Support")}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
