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
} from "@virtbase/ui/sidebar";
import { COOKIE_DOMAIN } from "@virtbase/utils";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import NextImage from "next/image";
import { getLocale } from "next-intl/server";
import { COOKIE_NAME, locales } from "@/i18n/config";

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

export async function LocaleSwitcher() {
  const currentLocale = await getLocale();
  const selectedLocale = localeMapping[currentLocale];

  // TODO: Update locale in database
  async function updateLocaleAction(data: FormData) {
    "use server";

    const store = await cookies();
    store.set(COOKIE_NAME, data.get("locale") as string, {
      domain: COOKIE_DOMAIN,
    });

    revalidatePath("/app.virtbase.com");
    revalidatePath("/admin.virtbase.com");
  }

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
            side="bottom"
            align="end"
            sideOffset={4}
            //side={isMobile || isSidebarOpen ? "bottom" : "right"}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <form action={updateLocaleAction}>
              {locales
                .filter((locale) => locale !== currentLocale)
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
