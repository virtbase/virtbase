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

import { useQuery } from "@tanstack/react-query";
import type { RouterInputs, RouterOutputs } from "@virtbase/api";
import { canAccessConsole } from "@virtbase/utils";
import { useTRPC } from "@/lib/trpc/react";
import { useServerStatus } from "../use-server-status";

export type GetServerConsoleInput = RouterInputs["servers"]["console"]["get"];

export type GetServerConsoleOutput = RouterOutputs["servers"]["console"]["get"];

interface GetServerConsole extends GetServerConsoleInput {
  queryConfig?: never;
}

export const useServerConsole = ({
  queryConfig,
  ...input
}: GetServerConsole) => {
  const trpc = useTRPC();

  const {
    data: { status } = {},
    isPending: isServerStatusPending,
    isLoading: isServerStatusLoading,
    isError: isServerStatusError,
  } = useServerStatus({
    server_id: input.server_id,
  });

  const query = useQuery(
    trpc.servers.console.get.queryOptions(input, {
      enabled: !!status && canAccessConsole(status),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchInterval: () => {
        // Reconnect every 10 minutes
        return 10 * 60 * 1000;
      },
    }),
  );

  return {
    ...query,
    serverStatus: status,
    isServerStatusPending,
    isServerStatusLoading,
    isServerStatusError,
  };
};
