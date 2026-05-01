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
import type { GetServerOutput } from "../hooks/use-server";
import { useServer } from "../hooks/use-server";
import { useUnmountImage } from "../hooks/use-unmount-image";
import { ServerCustomImageSelect } from "./server-custom-image-select";

// TODO: Refactor + handle failed uploads
export default function ServerMountsDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description"
  >,
) {
  const t = useExtracted();
  const { id: serverId } = useParams<{ id: string }>();

  const {
    data: {
      server: { mounts },
    } = { server: { mounts: [] } },
    isPending: isLoadingServer,
  } = useServer({
    server_id: serverId,
  });

  return (
    <ResponsiveDialog
      title={t("Mount ISO Images")}
      description={t("Mount ISO images to your server.")}
      {...props}
    >
      <FieldGroup>
        {Array.from({ length: 2 }).map((_, index) => {
          const mount = mounts[index];
          return (
            <Suspense fallback={<Skeleton className="h-10 w-full" />}>
              <ServerMountImageItem
                key={index}
                mount={mount}
                serverId={serverId}
                disabled={isLoadingServer}
                index={index}
              />
            </Suspense>
          );
        })}
      </FieldGroup>
    </ResponsiveDialog>
  );
}

function ServerMountImageItem({
  mount,
  serverId,
  disabled,
  index,
}: {
  mount?: GetServerOutput["server"]["mounts"][number];
  serverId: string;
  disabled: boolean;
  index: number;
}) {
  const t = useExtracted();
  const isMounted = !!mount && typeof mount !== "string";

  // TODO: Upload status

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

  return (
    <Field>
      <FieldLabel htmlFor={`mount-${index}`}>
        {t("Slot {count}", { count: String(index + 1) })}
      </FieldLabel>
      <ServerCustomImageSelect
        id={`mount-${index}`}
        images={images}
        value={isMounted ? mount.image.id : ""}
        onValueChange={(value) =>
          mountImage({
            server_id: serverId,
            iso_download_id: value,
          })
        }
        disabled={disabled || isMountingImage || isUnmountingImage}
      />
      {isMounted && (
        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            unmountImage({
              server_id: serverId,
              mount_id: mount.id,
            })
          }
          disabled={disabled || isMountingImage || isUnmountingImage}
        >
          <LucideX aria-hidden="true" />
          <span className="sr-only">{t("Unmount")}</span>
        </Button>
      )}
    </Field>
  );
}
