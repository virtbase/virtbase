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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import { LucideChevronsUpDown } from "@virtbase/ui/icons";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@virtbase/ui/sidebar";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import type { Locale } from "next-intl";
import { useFormatter, useLocale } from "next-intl";
import { useTransition } from "react";
import { locales } from "@/i18n/config";
import { getLocaleFlag } from "@/i18n/utils";
import { updateLocaleAction } from "./locale-switcher-action";

export function LocaleSwitcher() {
  const activeLocale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /**
   * The console reads its language from the segment the proxy injected, and
   * that was chosen before this action ran. Writing the preference therefore
   * changes nothing on screen by itself - only a fresh request through the
   * proxy can, which is what `refresh()` is for.
   */
  const onSelect = (locale: Locale) => {
    const data = new FormData();
    data.set("locale", locale);

    startTransition(async () => {
      await updateLocaleAction(data);
      router.refresh();
    });
  };

  const { isMobile, open: isSidebarOpen } = useSidebar();

  const selectedLocaleLabel = format.displayName(activeLocale, {
    type: "language",
  });

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton variant="outline" tooltip={selectedLocaleLabel}>
              <NextImage
                src={getLocaleFlag(activeLocale)}
                alt={selectedLocaleLabel}
                width={20}
                height={20}
                unoptimized
              />
              <span className="flex-1 truncate">{selectedLocaleLabel}</span>
              <LucideChevronsUpDown
                aria-hidden="true"
                className="text-muted-foreground"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={4}
            side={isMobile || isSidebarOpen ? "bottom" : "right"}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            {locales
              .filter((locale) => locale !== activeLocale)
              .map((locale) => {
                const label = format.displayName(locale, {
                  type: "language",
                });

                return (
                  <DropdownMenuItem
                    key={locale}
                    disabled={isPending}
                    onSelect={() => onSelect(locale)}
                  >
                    <NextImage
                      src={getLocaleFlag(locale)}
                      alt={label}
                      width={20}
                      height={20}
                      unoptimized
                    />
                    {label}
                  </DropdownMenuItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
