/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@virtbase/ui/popover";
import type { ReactNode } from "react";
import { IntlLink } from "@/i18n/navigation.public.ts";

/**
 * A glossary term in running text. A button rather than a hover tooltip, so it
 * opens by tap and by keyboard as well as by mouse.
 */
export function GlossaryTermPopover({
  title,
  description,
  href,
  linkLabel,
  children,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-help rounded-sm text-inherit underline decoration-muted-foreground decoration-dotted underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-sm" sideOffset={6}>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-muted-foreground">{description}</p>
        <IntlLink
          href={href}
          prefetch={false}
          className="mt-3 inline-block font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
        >
          {linkLabel}
        </IntlLink>
      </PopoverContent>
    </Popover>
  );
}
