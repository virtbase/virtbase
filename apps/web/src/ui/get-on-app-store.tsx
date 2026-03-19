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

import { cn } from "@virtbase/ui";
import { APP_NAME, APP_STORE_URL } from "@virtbase/utils";
import NextImage from "next/image";
import NextLink from "next/link";
import { useLocale } from "next-intl";

export function GetOnAppStore({ className }: { className?: string }) {
  const locale = useLocale();

  return (
    <NextLink
      href={APP_STORE_URL}
      target="_blank"
      prefetch={false}
      className={cn("relative block aspect-3/1 h-10 w-fit shrink-0", className)}
    >
      <NextImage
        src={`/assets/static/apple/pre_order_${locale}.svg`}
        alt={`${APP_NAME} App`}
        className="select-none object-contain"
        fill
        unoptimized
        draggable={false}
      />
    </NextLink>
  );
}
