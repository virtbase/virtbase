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
import { Badge } from "@virtbase/ui/badge";
import { useDebouncedCallback } from "@virtbase/ui/hooks";
import { LucideCheck, LucideInfo, LucideSearch } from "@virtbase/ui/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import { Logo } from "@virtbase/ui/logo";
import { ScrollArea } from "@virtbase/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@virtbase/ui/tooltip";
import type { IsoCatalogEntry } from "@virtbase/utils";
import { ISO_CATALOG } from "@virtbase/utils";
import { useExtracted, useFormatter } from "next-intl";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";

const SEARCH_DEBOUNCE_MS = 300;

export function IsoCatalogGrid({
  value,
  onValueChange,
  disabled,
}: {
  value: string | null;
  onValueChange: (entry: IsoCatalogEntry) => void;
  disabled?: boolean;
}) {
  const t = useExtracted();

  // The search lives in the URL so it survives a reload and can be shared.
  // `query` mirrors it locally to keep typing responsive, and the write to the
  // URL is debounced so every keystroke is not a history entry.
  const [needle, setNeedle] = useQueryState(
    "image_search",
    parseAsString.withDefault("").withOptions({
      clearOnDefault: true,
      shallow: true,
    }),
  );
  const [query, setQuery] = useState(needle);
  const debouncedSetNeedle = useDebouncedCallback(
    (next: string) => void setNeedle(next),
    SEARCH_DEBOUNCE_MS,
  );

  const entries = useMemo(() => {
    const search = needle.trim().toLowerCase();
    if (!search) {
      return ISO_CATALOG;
    }

    return ISO_CATALOG.filter(
      (entry) =>
        entry.name.toLowerCase().includes(search) ||
        entry.url.toLowerCase().includes(search),
    );
  }, [needle]);

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex min-w-0 flex-col gap-3">
        {/* First tabbable element in the dialog on purpose: it takes the initial
          focus, which keeps the tooltip below from opening on its own. */}
        <InputGroup>
          <InputGroupAddon>
            <LucideSearch strokeWidth={1.5} />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck="false"
            disabled={disabled}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              debouncedSetNeedle(event.target.value);
            }}
            placeholder={t("Search images")}
            aria-label={t("Search images")}
          />
        </InputGroup>
        <legend className="mb-3 flex items-center gap-1.5">
          <span className="font-medium text-foreground text-sm">
            {t("Trusted images")}
          </span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                type="button"
                aria-label={t("About trusted images")}
              >
                <LucideInfo
                  strokeWidth={1.5}
                  className="size-3.5 text-muted-foreground"
                />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs px-4 py-2 text-center text-sm">
                {t(
                  "These images are downloaded straight from the vendor's own servers. Virtbase checks each source, but does not host or modify the images.",
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </legend>

        <ScrollArea className="h-[42vh]">
          {entries.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              {t("No image matches your search.")}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {entries.map((entry) => (
                <IsoCatalogCard
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === value}
                  disabled={disabled}
                  onSelect={() => onValueChange(entry)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </fieldset>
    </div>
  );
}

function IsoCatalogCard({
  entry,
  selected,
  disabled,
  onSelect,
}: {
  entry: IsoCatalogEntry;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const t = useExtracted();
  const formatter = useFormatter();

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "group relative rounded-lg border border-border bg-background p-4 text-left transition-[color,box-shadow,border-color] hover:shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        selected && "border-primary bg-primary/5 ring-1 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <OperatingSystemIcon icon={entry.icon} className="size-6" />
        <div className="flex items-center gap-1.5">
          {selected && (
            <LucideCheck
              className="size-4 text-primary"
              aria-hidden="true"
              strokeWidth={2}
            />
          )}
          <Badge variant="secondary" className="gap-1">
            {/* Wrapped so the badge's `[&>svg]:size-3` rule cannot squash the
                wide logo into a square. */}
            <span className="flex">
              <Logo className="h-2.5 w-auto text-current" />
            </span>
            {t("Verified")}
          </Badge>
        </div>
      </div>
      <h4 className="mt-4 truncate font-semibold text-foreground text-sm">
        {entry.name}
      </h4>
      <p className="mt-1 text-muted-foreground text-sm">
        {t("Released {date}", {
          // Parse as local time - a bare `YYYY-MM-DD` is UTC midnight and would
          // render as the previous day west of Greenwich.
          date: formatter.dateTime(new Date(`${entry.releasedAt}T00:00:00`), {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
        })}
      </p>
    </button>
  );
}
