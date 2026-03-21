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

export type GetServerInput = RouterInputs["servers"]["get"];

export type GetServerOutput = RouterOutputs["servers"]["get"];

interface GetServer extends GetServerInput {
  queryConfig?: never;
}

export const useServer = ({ queryConfig, ...input }: GetServer) => {
  const trpc = useTRPC();

  return useQuery(
    trpc.servers.get.queryOptions(input, {
      refetchInterval: (query) => {
        const currentData = query.state.data;
        if (!currentData) {
          return false;
        }

        if (isInstalling(currentData.server)) {
          return 5_000;
        }

        return false;
      },
    }),
  );
};
