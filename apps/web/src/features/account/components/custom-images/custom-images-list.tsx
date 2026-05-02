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

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { LucideDisc3 } from "@virtbase/ui/icons";
import { useExtracted, useFormatter, useNow } from "next-intl";
import type { GetCustomImagesListOutput } from "../../hooks/custom-images/use-custom-image-list";
import { useCustomImagesList } from "../../hooks/custom-images/use-custom-image-list";
import { ItemRow } from "../item-row";

export function CustomImagesList() {
  const t = useExtracted();

  const {
    data: { iso_downloads: images },
  } = useCustomImagesList();

  if (!images.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideDisc3 aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No custom images")}</EmptyTitle>
          <EmptyDescription>
            {t("No custom images have been uploaded yet.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return images.map((image) => {
    return <CustomImageItem key={image.id} image={image} />;
  });
}

function CustomImageItem({
  image,
}: {
  image: GetCustomImagesListOutput["iso_downloads"][number];
}) {
  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 1000 });

  return (
    <ItemRow
      icon={<LucideDisc3 className="size-6 shrink-0" />}
      rightSide={
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <p className="text-sm">
            {t("Expires {time}", {
              time: format.relativeTime(image.expires_at, now),
            })}
          </p>
        </div>
      }
    >
      <p className="truncate font-medium text-sm">{image.name}</p>
      <p className="truncate text-muted-foreground text-sm leading-none">
        {image.url}
      </p>
    </ItemRow>
  );
}
