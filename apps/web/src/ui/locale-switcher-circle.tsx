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

import { Button } from "@virtbase/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import NextImage from "next/image";
import type { Locale } from "next-intl";
import { useFormatter, useLocale } from "next-intl";
import { useTransition } from "react";
import { locales } from "@/i18n/config";
import { useIntlPathname, useIntlRouter } from "@/i18n/navigation.public";
import { getLocaleFlag } from "@/i18n/utils";

export function LocaleSwitcherCircle() {
  const activeLocale = useLocale();
  const format = useFormatter();
  const router = useIntlRouter();
  const pathname = useIntlPathname();

  const [isPending, startTransition] = useTransition();

  const onSelect = (locale: Locale) => {
    startTransition(() => {
      router.replace({ pathname }, { locale });
    });
  };

  const selectedLocaleLabel = format.displayName(activeLocale, {
    type: "language",
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          disabled={isPending}
        >
          <NextImage
            src={getLocaleFlag(activeLocale)}
            alt={selectedLocaleLabel}
            width={20}
            height={20}
            unoptimized
          />
          <span className="sr-only">{selectedLocaleLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        side="bottom"
        className="min-w-(--radix-dropdown-menu-trigger-width)"
      >
        {locales
          .filter((locale) => locale !== activeLocale)
          .map((locale) => {
            const label = format.displayName(locale, {
              type: "language",
            });

            return (
              <DropdownMenuItem key={locale} onSelect={() => onSelect(locale)}>
                <NextImage
                  src={getLocaleFlag(locale)}
                  alt={label}
                  width={20}
                  height={20}
                  unoptimized
                />
                <span>{label}</span>
              </DropdownMenuItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
