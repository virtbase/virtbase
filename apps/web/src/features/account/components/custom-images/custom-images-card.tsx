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

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { Skeleton } from "@virtbase/ui/skeleton";
import { MAX_ACTIVE_ISO_DOWNLOADS_PER_USER } from "@virtbase/utils";
import { useExtracted } from "next-intl";
import { ErrorBoundary } from "react-error-boundary";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server.tsx";
import { GenericError } from "@/ui/generic-error.tsx";
import { defaultGetCustomImagesListQuery } from "../../hooks/custom-images/use-custom-image-list.ts";
import { CreateCustomImageButton } from "./create-custom-image-button.tsx";
import { CustomImagesList } from "./custom-images-list.tsx";

export function CustomImagesCard() {
  const t = useExtracted();

  void prefetch(trpc.iso.list.queryOptions(defaultGetCustomImagesListQuery));

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader>
        <CardTitle className="text-lg">{t("Custom ISO Images")}</CardTitle>
        <CardDescription>
          {t("Upload and manage custom ISO images for your servers.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ErrorBoundary fallback={<GenericError className="border" />}>
          <HydrateClient fallback={<Skeleton className="-m-px h-48 w-full" />}>
            <CustomImagesList />
          </HydrateClient>
        </ErrorBoundary>
      </CardContent>
      <CardFooter className="border-t bg-background [.border-t]:p-6">
        <div className="flex w-full flex-col items-center justify-center gap-4 lg:flex-row lg:justify-between">
          <p className="text center text-muted-foreground text-sm">
            {t("You can have up to {count} active ISO images.", {
              count: String(MAX_ACTIVE_ISO_DOWNLOADS_PER_USER),
            })}
          </p>
          <CreateCustomImageButton />
        </div>
      </CardFooter>
    </Card>
  );
}
