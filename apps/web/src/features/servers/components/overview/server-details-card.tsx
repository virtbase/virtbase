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
import { Card, CardContent, CardHeader, CardTitle } from "@virtbase/ui/card";
import {
  LucideEdit,
  LucideInfo,
  LucideLock,
  MonitorCog,
} from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import { isOperational } from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { CopyButton } from "@/ui/copy-button";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";
import { useServer } from "../../hooks/use-server";
import { useServerActionState } from "../../hooks/use-server-action-state";

export function ServerDetailsCard() {
  const t = useExtracted();

  const { setAction } = useServerActionState();

  const { id: serverId } = useParams<{ id: string }>();
  const {
    data: { server } = {},
    isPending,
    isError,
  } = useServer({
    server_id: serverId,
  });

  const isActionsDisabled =
    isPending || isError || !server || !isOperational(server);

  // Currently only one IPv4 and IPv6 address is supported for display
  // The UI would need to be updated to support multiple addresses.

  const ipv4 = server?.allocations.find(
    (allocation) =>
      typeof allocation !== "string" && allocation.subnet.family === 4,
  );

  const ipv6 = server?.allocations.find(
    (allocation) =>
      typeof allocation !== "string" && allocation.subnet.family === 6,
  );

  return (
    <Card className="gap-4 overflow-hidden">
      <CardHeader>
        <CardTitle>{t("Server")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex h-8 flex-row items-center justify-between gap-4">
          <p className="font-medium text-base text-muted-foreground">
            {t("Name")}
          </p>
          <div className="flex flex-row items-center gap-2 truncate font-medium text-sm">
            {isPending || isError || !server ? (
              <Skeleton className="h-5 w-24" />
            ) : (
              <p className="truncate">{server.name}</p>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label={t("Rename Server")}
              disabled={isPending || isError || !server}
              onClick={() => setAction("rename")}
            >
              <LucideEdit aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="flex h-8 flex-row items-center justify-between gap-4">
          <p className="font-medium text-base text-muted-foreground">
            {t("Operating System")}
          </p>
          <div className="flex flex-row items-center gap-2 truncate font-medium text-sm">
            {isPending || isError || !server ? (
              <Skeleton className="h-5 w-24" />
            ) : typeof server.template !== "string" ? (
              <div className="flex items-center gap-2">
                <OperatingSystemIcon icon={server.template?.icon} />
                <span className="truncate">
                  {server.template?.name ?? t("Custom Image")}
                </span>
              </div>
            ) : (
              <span className="truncate">-</span>
            )}
          </div>
        </div>
        <div className="flex h-8 flex-row items-center justify-between gap-4">
          <p className="font-medium text-base text-muted-foreground">
            {t("Node")}
          </p>
          <div className="flex flex-row items-center gap-2 truncate font-medium text-sm">
            {isPending || isError || !server ? (
              <Skeleton className="h-5 w-24" />
            ) : (
              <p className="truncate">
                {typeof server.node === "object" ? server.node.hostname : "-"}
              </p>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label={t("View Node Details")}
              disabled={isPending || isError || !server}
              onClick={() => setAction("view-node-details")}
            >
              <LucideInfo aria-hidden />
            </Button>
          </div>
        </div>
        <div className="flex h-8 flex-row items-center justify-between gap-4">
          <p className="font-medium text-base text-muted-foreground">IPv4</p>
          <div className="flex flex-row items-center gap-2 truncate font-medium text-sm">
            {isPending || isError || !server ? (
              <Skeleton className="h-5 w-24" />
            ) : ipv4 && typeof ipv4 !== "string" ? (
              <div className="flex items-center gap-1">
                <p className="truncate">{ipv4.subnet.cidr}</p>
                <CopyButton value={ipv4.subnet.cidr} />
                <p className="truncate">Gateway: {ipv4.subnet.gateway}</p>
                <CopyButton value={ipv4.subnet.gateway} />
              </div>
            ) : (
              <p className="truncate">-</p>
            )}
          </div>
        </div>
        <div className="flex h-8 flex-row items-center justify-between gap-4">
          <p className="font-medium text-base text-muted-foreground">IPv6</p>
          <div className="flex flex-row items-center gap-2 truncate font-medium text-sm">
            {isPending || isError || !server ? (
              <Skeleton className="h-5 w-24" />
            ) : ipv6 && typeof ipv6 !== "string" ? (
              <div className="flex items-center gap-1">
                <p className="truncate">{ipv6.subnet.cidr}</p>
                <CopyButton value={ipv6.subnet.cidr} />
                <p className="truncate">Gateway: {ipv6.subnet.gateway}</p>
                <CopyButton value={ipv6.subnet.gateway} />
              </div>
            ) : (
              <p className="truncate">-</p>
            )}
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => setAction("change-operating-system")}
            disabled={isActionsDisabled}
          >
            <MonitorCog className="text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{t("Change Operating System")}</span>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => setAction("reset-root-password")}
            disabled={isActionsDisabled}
          >
            <LucideLock className="text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{t("Reset Root Password")}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
