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

import { isAdmin } from "@virtbase/auth/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  LucideChevronsUpDown,
  LucideCrown,
  LucideLayoutDashboard,
  LucideLink,
  LucideLogOut,
  LucideUser,
} from "@virtbase/ui/icons";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@virtbase/ui/sidebar";
import { Skeleton } from "@virtbase/ui/skeleton";
import { ADMIN_DOMAIN, ADMIN_HOSTNAMES, PUBLIC_DOMAIN } from "@virtbase/utils";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { authClient } from "@/lib/auth/client";
import { paths } from "@/lib/paths";
import { UserAvatar } from "@/ui/user-avatar";

export function NavUser() {
  const t = useExtracted();

  const { isMobile, open: isSidebarOpen } = useSidebar();
  const router = useRouter();

  const { data: sessionData, isPending } = authClient.useSession();

  if (!sessionData || isPending) {
    return <Skeleton className="h-12 w-full" />;
  }

  const { user, session } = sessionData;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <UserAvatar
                user={user}
                className="in-data-[state=expanded]:size-6 transition-[width,height] duration-200 ease-in-out"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {user.name || user.email}
                </span>
              </div>
              <LucideChevronsUpDown
                aria-hidden="true"
                className="text-muted-foreground"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side={isMobile || isSidebarOpen ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{user.name}</span>
                  <span className="truncate font-normal text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <NextLink href={paths.app.home.getHref()} prefetch={false}>
                  <LucideLayoutDashboard
                    className="size-5"
                    aria-hidden="true"
                  />
                  <span>{t("Dashboard")}</span>
                </NextLink>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <NextLink
                  href={paths.app.account.settings.getHref()}
                  prefetch={false}
                >
                  <LucideUser className="size-5" aria-hidden="true" />
                  <span>{t("Account")}</span>
                </NextLink>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {
                // User has admin role
                isAdmin(user) &&
                  // User is not impersonated
                  !session.impersonatedBy &&
                  // User is not in the admin panel at the moment and client side
                  typeof window !== "undefined" &&
                  !ADMIN_HOSTNAMES.has(window.location.hostname) && (
                    <DropdownMenuItem asChild>
                      <NextLink href={ADMIN_DOMAIN} prefetch={false}>
                        <LucideCrown className="size-5" aria-hidden="true" />
                        <span>{t("Administration")}</span>
                      </NextLink>
                    </DropdownMenuItem>
                  )
              }
              <DropdownMenuItem asChild>
                <NextLink href={PUBLIC_DOMAIN} prefetch={false}>
                  <LucideLink className="size-5" aria-hidden="true" />
                  <span>{t("Homepage")}</span>
                </NextLink>
              </DropdownMenuItem>
              {session.impersonatedBy ? (
                <DropdownMenuItem
                  onSelect={() =>
                    authClient.admin.stopImpersonating({
                      fetchOptions: {
                        onSuccess: () => {
                          router.push(ADMIN_DOMAIN);
                        },
                      },
                    })
                  }
                >
                  <LucideLogOut className="size-5" aria-hidden="true" />
                  <span>{t("Stop impersonation")}</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() =>
                    authClient.signOut({
                      fetchOptions: {
                        onSuccess: () => {
                          router.push("/login");
                        },
                      },
                    })
                  }
                >
                  <LucideLogOut className="size-5" aria-hidden="true" />
                  <span>{t("Logout")}</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
