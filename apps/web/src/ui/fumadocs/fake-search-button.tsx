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

import { cn } from "@virtbase/ui";
import { LucideSearch } from "@virtbase/ui/icons";
import { Kbd } from "@virtbase/ui/kbd";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { useExtracted } from "next-intl";

export function FakeSearchButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  const { setOpenSearch, enabled } = useSearchContext();

  const t = useExtracted();
  return (
    <button
      type="button"
      className={cn("group relative flex w-full focus:outline-none", className)}
      onClick={() => setOpenSearch(true)}
      disabled={!enabled}
      {...props}
    >
      <LucideSearch
        aria-hidden="true"
        className="lucide lucide-search absolute inset-y-0 left-4 z-10 my-auto h-4 w-4 text-muted-foreground"
      />
      <div className="w-full rounded-md border border-border bg-input/50 p-3 pl-12 text-left text-muted-foreground transition-colors group-active:bg-input">
        {t("Search")}
      </div>
      <Kbd className="absolute inset-y-0 right-4 my-auto h-5 bg-transparent text-muted-foreground text-sm">
        ⌘K
      </Kbd>
    </button>
  );
}
