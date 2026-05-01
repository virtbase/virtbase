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
import { ChevronsUpDown, LucideCheck, LucideDisc3 } from "@virtbase/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@virtbase/ui/popover";
import { useExtracted } from "next-intl";
import type React from "react";
import { useState } from "react";
import type { GetCustomImagesListOutput } from "@/features/account/hooks/custom-images/use-custom-image-list";

export function ServerCustomImageSelect({
  className,
  value,
  onValueChange,
  images,
  modal,
  ...props
}: {
  className?: string;
  value: string;
  onValueChange: (value: string) => void;
  images: GetCustomImagesListOutput["iso_downloads"];
} & Omit<React.ComponentProps<"button">, "value" | "onValueChange"> & {
    modal?: boolean;
  }) {
  const t = useExtracted();
  const [isOpen, setIsOpen] = useState(false);

  const selectedImage = images.find((image) => image.id === value);

  return (
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
            <LucideDisc3 aria-hidden="true" />
            {value ? selectedImage?.name : t("Select a custom image...")}
          </div>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder={t("Search for a custom image...")} />
          <CommandList className="scrollbar-thin">
            <CommandEmpty>{t("No custom image found.")}</CommandEmpty>
            {images.map((image) => (
              <CommandGroup key={image.id} heading={image.name}>
                <CommandItem
                  value={image.id}
                  key={image.id}
                  onSelect={() => {
                    onValueChange(image.id);
                    setIsOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <LucideDisc3 aria-hidden="true" />
                    <span className="truncate">{image.name}</span>
                  </div>
                  <LucideCheck
                    className={cn(
                      "ml-auto",
                      image.id === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
