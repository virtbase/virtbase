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
import type { LucideIcon } from "@virtbase/ui/icons";
import {
  LucideBuilding,
  LucideCpu,
  LucideHardDrive,
  LucideMemoryStick,
  LucideNetwork,
  LucideTag,
} from "@virtbase/ui/icons";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Skeleton } from "@virtbase/ui/skeleton";
import { formatBits } from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useExtracted, useFormatter } from "next-intl";
import { useServer } from "../../hooks/use-server";

export default function NodeDetailsDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  >,
) {
  const t = useExtracted();
  const format = useFormatter();

  const { id: serverId } = useParams<{ id: string }>();
  const {
    data: { server } = {},
    isPending,
    isError,
  } = useServer({
    server_id: serverId,
  });

  if (isPending || isError || !server) {
    return <Skeleton className="h-full w-full" />;
  }

  const { node, datacenter } = server;

  if (typeof node !== "object" || typeof datacenter !== "object") {
    return null;
  }

  return (
    <ResponsiveDialog
      title={t("Node")}
      description={t("Details of the node.")}
      footer={
        <Button
          type="button"
          variant="default"
          onClick={() => {
            props.onOpenChange?.(false);
          }}
        >
          {t("Close")}
        </Button>
      }
      {...props}
    >
      <div className="flex flex-col max-md:gap-4">
        <RowItem title={t("Name")} icon={LucideTag}>
          <p>{node.hostname}</p>
        </RowItem>
        {node.cpu_description && (
          <RowItem title={t("CPU")} icon={LucideCpu}>
            <p>{node.cpu_description}</p>
          </RowItem>
        )}
        {node.memory_description && (
          <RowItem title={t("Memory")} icon={LucideMemoryStick}>
            <p>{node.memory_description}</p>
          </RowItem>
        )}
        {node.storage_description && (
          <RowItem title={t("Storage")} icon={LucideHardDrive}>
            <p>{node.storage_description}</p>
          </RowItem>
        )}
        <RowItem title={t("Datacenter")} icon={LucideBuilding}>
          <p>{datacenter.name}</p>
        </RowItem>
        {node.netrate && (
          <RowItem title={t("Uplink")} icon={LucideNetwork}>
            <p>
              {formatBits(node.netrate * 1e6 * 8, {
                formatter: format,
                perSecond: true,
                base: 1000,
              })}
            </p>
          </RowItem>
        )}
      </div>
    </ResponsiveDialog>
  );
}

function RowItem({
  title,
  children,
  ...props
}: {
  title: string;
  children: React.ReactNode;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-col justify-between md:h-8 md:flex-row md:items-center md:gap-4">
      <div className="flex items-center gap-2 font-medium text-base text-muted-foreground">
        <props.icon
          className="size-4 shrink-0"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span>{title}</span>
      </div>
      <div className="flex flex-row items-center gap-2 truncate font-medium text-sm">
        {children}
      </div>
    </div>
  );
}
