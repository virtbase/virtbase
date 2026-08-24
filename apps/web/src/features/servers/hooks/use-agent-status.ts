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
import { UNBATCHED, useTRPC } from "@/lib/trpc/react";

export type GetAgentStatusInput = RouterInputs["servers"]["agent"]["get"];

export type GetAgentStatusOutput = RouterOutputs["servers"]["agent"]["get"];

interface GetAgentStatus extends GetAgentStatusInput {
  queryConfig?: never;
}

/**
 * The state of the `qemu-guest-agent` inside a server.
 *
 * Results are cached server-side for a minute, so this deliberately does not
 * poll: refetching harder would only re-read the same cached probe while
 * costing a request per interval.
 */
export const useAgentStatus = ({ queryConfig, ...input }: GetAgentStatus) => {
  const trpc = useTRPC();

  return useQuery(trpc.servers.agent.get.queryOptions(input, UNBATCHED));
};
