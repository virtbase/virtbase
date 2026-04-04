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
import { useLocale } from "next-intl";
import { defaultLocale, locales } from "@/i18n/config";
import { updateLocaleAction } from "./locale-switcher-action";

const localeMapping = {
  en: {
    label: "English",
    image: "/assets/static/flags/us.svg",
  },
  de: {
    label: "Deutsch",
    image: "/assets/static/flags/de.svg",
  },
  fr: {
    label: "Français",
    image: "/assets/static/flags/fr.svg",
  },
  nl: {
    label: "Nederlands",
    image: "/assets/static/flags/nl.svg",
  },
} as const;

export function LocaleSwitcher() {
  const currentLocale = useLocale();

  const { isMobile, open: isSidebarOpen } = useSidebar();

  const activeLocale =
    currentLocale in localeMapping ? currentLocale : defaultLocale;
  const selectedLocale = localeMapping[activeLocale];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton variant="outline" tooltip={selectedLocale.label}>
              <NextImage
                src={selectedLocale.image}
                alt={selectedLocale.label}
                width={20}
                height={20}
                unoptimized
              />
              <span className="flex-1 truncate">{selectedLocale.label}</span>
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
            <form action={updateLocaleAction}>
              {locales
                .filter((locale) => locale !== activeLocale)
                .map((locale) => (
                  <DropdownMenuItem key={locale} asChild>
                    <button
                      className="w-full"
                      name="locale"
                      value={locale}
                      type="submit"
                    >
                      <NextImage
                        src={localeMapping[locale].image}
                        alt={localeMapping[locale].label}
                        width={20}
                        height={20}
                        unoptimized
                      />
                      {localeMapping[locale].label}
                    </button>
                  </DropdownMenuItem>
                ))}
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
