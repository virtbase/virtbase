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

import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@virtbase/ui";
import { Badge } from "@virtbase/ui/badge";
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
  LucideDisc3,
  LucideLoaderCircle,
  LucideX,
} from "@virtbase/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@virtbase/ui/popover";
import { useExtracted, useFormatter } from "next-intl";
import type React from "react";
import { useEffect, useState } from "react";
import type { GetCustomImagesListOutput } from "@/features/account/hooks/custom-images/use-custom-image-list";
import { defaultGetCustomImagesListQuery } from "@/features/account/hooks/custom-images/use-custom-image-list";
import { useCustomImageStatus } from "@/features/account/hooks/custom-images/use-custom-image-status";
import { useTRPC } from "@/lib/trpc/react";

type CustomImage = GetCustomImagesListOutput["iso_downloads"][number];

const STATUS_REFETCH_INTERVAL_MS = 3_000;

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
    <>
      {/*
        Render the status pollers outside the Popover so polling continues
        regardless of whether the dropdown is open. The Proxmox download task
        only persists its finished/failed state when the status endpoint is
        polled, so we keep polling until the list query reflects completion.
      */}
      {images.map((image) =>
        !image.finished_at ? (
          <CustomImageStatusPoller key={image.id} image={image} />
        ) : null,
      )}

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
          className="min-w-(--radix-popover-trigger-width) p-0"
          onWheel={(e) => e.stopPropagation()}
        >
          <Command>
            <CommandInput placeholder={t("Search for a custom image...")} />
            <CommandList className="scrollbar-thin">
              <CommandEmpty>{t("No custom image found.")}</CommandEmpty>
              <CommandGroup>
                {images.map((image) => (
                  <CustomImageItem
                    key={image.id}
                    image={image}
                    selected={image.id === value}
                    onSelect={(id) => {
                      onValueChange(id);
                      setIsOpen(false);
                    }}
                  />
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

function CustomImageItem({
  image,
  selected,
  onSelect,
}: {
  image: CustomImage;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useExtracted();
  const format = useFormatter();

  const isFailed = !!image.failed_at;
  const isUploading = !image.finished_at && !isFailed;
  const isReady = !!image.finished_at && !isFailed;

  // Subscribe to the same query the poller uses so the percentage stays in
  // sync while the dropdown is open. The poller drives the actual interval.
  const { data: { status } = {} } = useCustomImageStatus({
    id: image.id,
    queryConfig: {
      enabled: isUploading,
    },
  });

  return (
    <CommandItem
      value={image.id}
      disabled={!isReady}
      onSelect={() => {
        if (!isReady) return;
        onSelect(image.id);
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isUploading ? (
          <LucideLoaderCircle className="animate-spin" aria-hidden="true" />
        ) : isFailed ? (
          <LucideX className="text-destructive" aria-hidden="true" />
        ) : (
          <LucideDisc3 aria-hidden="true" />
        )}
        <span className="truncate">{image.name}</span>
        {isUploading ? (
          <Badge variant="outline" className="ml-1 shrink-0">
            {status?.percentage != null
              ? t("Uploading {percentage}", {
                  percentage: format.number(status.percentage / 100, {
                    style: "percent",
                  }),
                })
              : t("Uploading...")}
          </Badge>
        ) : isFailed ? (
          <Badge variant="destructive" className="ml-1 shrink-0">
            {t("Failed")}
          </Badge>
        ) : null}
      </div>
      <LucideCheck
        className={cn("ml-auto", selected ? "opacity-100" : "opacity-0")}
      />
    </CommandItem>
  );
}

function CustomImageStatusPoller({ image }: { image: CustomImage }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: { status } = {} } = useCustomImageStatus({
    id: image.id,
    queryConfig: {
      enabled: !image.finished_at,
      refetchInterval: STATUS_REFETCH_INTERVAL_MS,
    },
  });

  useEffect(() => {
    // The list query holds the source of truth for finished_at. Once the
    // status endpoint observes completion, refresh the list so the dropdown
    // reflects the new state and stops polling.
    if (!image.finished_at && status?.finished_at) {
      void queryClient.invalidateQueries(
        trpc.iso.list.queryFilter(defaultGetCustomImagesListQuery),
      );
    }
  }, [
    image.finished_at,
    status?.finished_at,
    queryClient,
    trpc.iso.list.queryFilter,
  ]);

  return null;
}
