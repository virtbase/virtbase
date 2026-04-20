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
import { Button } from "@virtbase/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@virtbase/ui/command";
import { ChevronsUpDown, LucideCheck } from "@virtbase/ui/icons/index";
import { Popover, PopoverContent, PopoverTrigger } from "@virtbase/ui/popover";
import { FIRWALL_PROTOCOLS } from "@virtbase/utils";
import { useExtracted } from "next-intl";
import { useState } from "react";

interface FirewallProtocolSelectProps
  extends Omit<React.ComponentProps<typeof Button>, "value" | "onValueChange"> {
  value: string | undefined;
  onValueChange: (value: string | undefined) => void;
}

export function FirewallProtocolSelect({
  value,
  onValueChange,
  ...props
}: FirewallProtocolSelectProps) {
  const t = useExtracted();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-between",
            !value && "!dark:bg-input text-muted-foreground",
          )}
          {...props}
        >
          <div className="flex items-center gap-2">{value ? value : "*"}</div>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder={t("Search for a protocol...")} />
          <CommandList>
            <CommandEmpty>{t("No supported protocol found.")}</CommandEmpty>
            <CommandGroup>
              {["*", ...FIRWALL_PROTOCOLS].map((protocol) => (
                <CommandItem
                  value={protocol}
                  key={protocol}
                  onSelect={() => {
                    onValueChange(protocol === "*" ? undefined : protocol);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2">{protocol}</div>
                  <LucideCheck
                    className={cn(
                      "ml-auto",
                      (protocol === "*" && !value) || value === protocol
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
