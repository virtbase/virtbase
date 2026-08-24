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

export type GetFirewallAnalysisInput =
  RouterInputs["servers"]["firewall"]["analysis"]["get"];

export type GetFirewallAnalysisOutput =
  RouterOutputs["servers"]["firewall"]["analysis"]["get"];

export type FirewallFinding =
  GetFirewallAnalysisOutput["analysis"]["findings"][number];

interface GetFirewallAnalysis extends GetFirewallAnalysisInput {
  queryConfig?: never;
}

/**
 * Security findings for a server.
 *
 * The slow half of this - looking inside the server - is cached server-side, so
 * this deliberately does not poll.
 */
export const useFirewallAnalysis = ({
  queryConfig,
  ...input
}: GetFirewallAnalysis) => {
  const trpc = useTRPC();

  return useQuery(
    trpc.servers.firewall.analysis.get.queryOptions(input, UNBATCHED),
  );
};
