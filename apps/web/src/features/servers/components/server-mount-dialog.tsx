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

import { Button } from "@virtbase/ui/button";
import { Field, FieldGroup, FieldLabel } from "@virtbase/ui/field";
import { LucideX } from "@virtbase/ui/icons/index";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { Suspense } from "react";
import { toast } from "sonner";
import { useCustomImagesList } from "@/features/account/hooks/custom-images/use-custom-image-list";
import { useMountImage } from "../hooks/use-mount-image";
import { useServer } from "../hooks/use-server";
import { useUnmountImage } from "../hooks/use-unmount-image";
import { ServerCustomImageSelect } from "./server-custom-image-select";

// TODO: Rework this component
export default function ServerMountDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description"
  >,
) {
  const t = useExtracted();
  const { id: serverId } = useParams<{ id: string }>();

  const {
    data: {
      server: { mount },
    } = { server: { mount: null } },
    isPending: isLoadingServer,
  } = useServer({
    server_id: serverId,
  });

  const {
    data: { iso_downloads: images },
  } = useCustomImagesList();

  const { mutateAsync: mountImage, isPending: isMountingImage } = useMountImage(
    {
      mutationConfig: {
        onSuccess: () => {
          toast.success(
            t(
              "ISO image mounted successfully. Change will take effect on next boot.",
            ),
          );
        },
        onError: () => {
          toast.error(t("Could not mount ISO image."));
        },
      },
    },
  );

  const { mutateAsync: unmountImage, isPending: isUnmountingImage } =
    useUnmountImage({
      mutationConfig: {
        onSuccess: () => {
          toast.success(
            t(
              "ISO image unmounted successfully. Change will take effect on next boot.",
            ),
          );
        },
      },
    });

  const isMounted = !!mount && typeof mount !== "string";
  const isActionsDisabled =
    isLoadingServer || isMountingImage || isUnmountingImage;

  return (
    <ResponsiveDialog
      title={t("Mount ISO Images")}
      description={t("Mount ISO images to your server.")}
      {...props}
    >
      <FieldGroup>
        <Suspense fallback={<Skeleton className="h-10 w-full" />}>
          <Field>
            <FieldLabel htmlFor="mount">{t("ISO Image")}</FieldLabel>
            <div className="flex items-center gap-2">
              <ServerCustomImageSelect
                id="mount"
                images={images}
                value={isMounted ? mount.id : ""}
                onValueChange={(value) =>
                  mountImage({
                    server_id: serverId,
                    iso_download_id: value,
                  })
                }
                disabled={isActionsDisabled}
              />
              {isMounted && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    unmountImage({
                      server_id: serverId,
                    })
                  }
                  disabled={isActionsDisabled}
                >
                  <LucideX aria-hidden="true" />
                  <span className="sr-only">{t("Unmount")}</span>
                </Button>
              )}
            </div>
          </Field>
        </Suspense>
      </FieldGroup>
    </ResponsiveDialog>
  );
}
