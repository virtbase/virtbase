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

import { Badge } from "@virtbase/ui/badge";
import { LucideLoaderCircle } from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useParams } from "next/navigation";
import { useServer } from "../hooks/use-server";
import { useServerStatus } from "../hooks/use-server-status";
import { useStatusMapping } from "../hooks/use-status-mapping";
import { useTaskMapping } from "../hooks/use-task-mapping";
import { ServerMountBadge } from "./server-mount-badge";
import { ServerTerminatesBadge } from "./server-terminates-badge";

export function ServerLabel() {
  const { id: serverId } = useParams<{ id: string }>();

  const { data: { server } = {}, isPending: isServerPending } = useServer({
    server_id: serverId,
  });

  const { data: { status } = {}, isPending: isServerStatusPending } =
    useServerStatus({
      server_id: serverId,
    });

  const statusMapping = useStatusMapping();
  const taskMapping = useTaskMapping();

  if (isServerPending || isServerStatusPending || !server || !status) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-7 w-32" />
        <div className="flex items-center gap-1">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    );
  }

  const currentTask = status.task ? taskMapping[status.task] : null;
  const currentStatus = statusMapping[status.state];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="max-w-72 truncate font-semibold text-lg">
        {server.name}
      </span>
      <div className="flex items-center gap-1">
        <Badge
          variant={currentTask ? currentTask.variant : currentStatus.variant}
        >
          {currentTask ? (
            <LucideLoaderCircle className="animate-spin" />
          ) : (
            <currentStatus.icon aria-hidden />
          )}
          {currentTask ? currentTask.label : currentStatus.label}
        </Badge>
        <ServerMountBadge mount={server.mount} />
        <ServerTerminatesBadge server={server} />
      </div>
    </div>
  );
}
