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
import { isInstalling } from "@virtbase/utils";
import { useTRPC } from "@/lib/trpc/react";

export type ServerListInput = RouterInputs["servers"]["list"];

export type ServerListOutput = RouterOutputs["servers"]["list"];

interface ServerList extends ServerListInput {
  queryConfig?: never;
}

export const defaultServerListQuery = {
  sort: ["id:desc"],
  per_page: 100,
  expand: ["plan", "template"],
} satisfies ServerListInput;

export const useServerList = ({ queryConfig, ...input }: ServerList = {}) => {
  const trpc = useTRPC();

  return useQuery(
    trpc.servers.list.queryOptions(
      {
        ...defaultServerListQuery,
        ...input,
      },
      {
        refetchOnWindowFocus: true,
        refetchInterval: (query) => {
          const currentData = query.state.data;
          if (!currentData) {
            return false;
          }

          if (currentData.servers.some((server) => isInstalling(server))) {
            // Continue to refetch every 5 seconds until the server is installed
            return 5_000;
          }

          return false;
        },
      },
    ),
  );
};
