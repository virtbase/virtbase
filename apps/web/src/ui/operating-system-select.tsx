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
import {
  ChevronsUpDown,
  LucideCheck,
  LucideHardDrive,
  LucideMemoryStick,
} from "@virtbase/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@virtbase/ui/popover";
import { formatBytes } from "@virtbase/utils";
import { useExtracted, useFormatter } from "next-intl";
import type React from "react";
import { useState } from "react";
import type { getTemplateGroups } from "@/features/checkout/api/get-template-groups";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";

export function OperatingSystemSelect({
  className,
  value,
  onValueChange,
  templateGroups,
  modal,
  ...props
}: {
  className?: string;
  value: string;
  onValueChange: (value: string) => void;
  templateGroups: Awaited<ReturnType<typeof getTemplateGroups>>;
} & Omit<React.ComponentProps<"button">, "value" | "onValueChange"> & {
    modal?: boolean;
  }) {
  const [isOpen, setIsOpen] = useState(false);

  const t = useExtracted();
  const formatter = useFormatter();

  const selectedTemplate = templateGroups
    .flatMap((group) => group.templates)
    .find((template) => template.id === value);

  return (
    <div className="flex flex-col gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen} modal={modal}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-between",
              !value && "!dark:bg-input text-muted-foreground",
              className,
            )}
            {...props}
          >
            <div className="flex items-center gap-2">
              {selectedTemplate && (
                <OperatingSystemIcon icon={selectedTemplate.icon} />
              )}
              {value
                ? selectedTemplate?.name
                : t("Select an operating system...")}
            </div>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) p-0"
          onWheel={(e) => e.stopPropagation()}
        >
          <Command>
            <CommandInput
              placeholder={t("Search for an operating system...")}
            />
            <CommandList className="scrollbar-thin">
              <CommandEmpty>
                {t("No supported operating system found.")}
              </CommandEmpty>
              {templateGroups.map((group) => (
                <CommandGroup key={group.name} heading={group.name}>
                  {group.templates.map((template) => (
                    <CommandItem
                      value={template.name}
                      key={template.id}
                      onSelect={() => {
                        onValueChange(template.id);
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                          <div className="flex items-center gap-2">
                            <OperatingSystemIcon icon={template.icon} />
                            <span className="truncate">{template.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {template.recommendedMemory && (
                              <RecommendedBadge>
                                <LucideMemoryStick strokeWidth={1} />
                                <span className="text-xs">
                                  {formatBytes(
                                    (template.recommendedMemory ?? 0) *
                                      1024 *
                                      1024,
                                    {
                                      formatter,
                                    },
                                  )}
                                </span>
                              </RecommendedBadge>
                            )}
                            {template.requiredStorage && (
                              <RecommendedBadge>
                                <LucideHardDrive strokeWidth={1} />
                                <span className="text-xs">
                                  {formatBytes(
                                    (template.requiredStorage ?? 0) *
                                      1024 *
                                      1024 *
                                      1024,
                                    {
                                      formatter,
                                    },
                                  )}
                                </span>
                              </RecommendedBadge>
                            )}
                          </div>
                        </div>
                      </div>
                      <LucideCheck
                        className={cn(
                          "ml-auto",
                          template.id === value ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function RecommendedBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono font-normal text-[10px] text-muted-foreground opacity-100">
      {children}
    </div>
  );
}
