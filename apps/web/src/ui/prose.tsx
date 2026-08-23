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
import type { ComponentProps } from "react";

/**
 * Long-form typography for rendered MDX.
 *
 * The help and legal pages still carry their own copy of these classes; they
 * can adopt this once there is a reason to touch them.
 */
export function Prose({ className, ...props }: ComponentProps<"article">) {
  return (
    <article
      className={cn(
        "prose prose-neutral dark:prose-invert prose-headings:relative w-full max-w-none prose-headings:scroll-mt-20",
        "prose-a:font-medium prose-a:text-muted-foreground prose-thead:text-lg prose-a:underline-offset-4 transition-all prose-a:hover:text-foreground",
        "prose-headings:prose-a:text-foreground prose-headings:prose-a:no-underline",
        className,
      )}
      {...props}
    />
  );
}
