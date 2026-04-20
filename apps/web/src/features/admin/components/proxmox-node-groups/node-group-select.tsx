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
import { ChevronsUpDown, LucideCheck } from "@virtbase/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@virtbase/ui/popover";
import { useExtracted } from "next-intl";
import type React from "react";
import { use, useState } from "react";
import type { getLinkableProxmoxNodeGroups } from "../../api/proxmox-node-groups/get-linkable-proxmox-node-groups";

interface NodeGroupSelectProps
  extends Pick<React.ComponentProps<typeof Popover>, "modal">,
    React.ComponentProps<typeof Button> {
  promise: ReturnType<typeof getLinkableProxmoxNodeGroups>;
  value: string;
  onValueChange: (id: string) => void;
}

export function NodeGroupSelect({
  promise,
  value,
  onValueChange,
  modal,
  className,
  ...props
}: NodeGroupSelectProps) {
  const t = useExtracted();

  const nodeGroups = use(promise);
  const [isOpen, setIsOpen] = useState(false);

  const selectedNodeGroup = nodeGroups.find(
    (nodeGroup) => nodeGroup.id === value,
  );

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
            {selectedNodeGroup ? (
              <span className="truncate">{selectedNodeGroup.name}</span>
            ) : (
              t("Select a node group...")
            )}
          </div>
          <ChevronsUpDown className="opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder={t("Search for a node group...")} />
          <CommandList className="scrollbar-thin">
            <CommandEmpty>{t("No node group found.")}</CommandEmpty>
            <CommandGroup>
              {nodeGroups.map((nodeGroup) => (
                <CommandItem
                  value={nodeGroup.id}
                  key={nodeGroup.id}
                  onSelect={() => {
                    onValueChange(nodeGroup.id);
                    setIsOpen(false);
                  }}
                >
                  <span className="truncate">{nodeGroup.name}</span>
                  <LucideCheck
                    className={cn(
                      "ml-auto",
                      nodeGroup.id === value ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
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
