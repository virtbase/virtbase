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

import type { QueryClient } from "@tanstack/react-query";
import type { useTRPC } from "@/lib/trpc/react";

type TRPC = ReturnType<typeof useTRPC>;

/**
 * Re-runs the security analysis after a rule changed, without waiting for it.
 *
 * Deliberately not awaited. Every other query a rule mutation refreshes returns
 * in milliseconds, but the analysis reaches into the customer's server; making
 * the mutation settle only once advice came back would leave the dialog
 * spinning for seconds after the rule was already applied.
 *
 * Only the client query is invalidated. The slow half - what is listening and
 * what the firewall inside the server does - is cached on the server and has
 * not changed; the findings shift because the Virtbase rules are re-read, which
 * is exactly the part that just changed.
 */
export const invalidateFirewallAnalysis = (
  queryClient: QueryClient,
  trpc: TRPC,
  serverId: string,
): void => {
  void queryClient.invalidateQueries(
    trpc.servers.firewall.analysis.get.queryFilter({ server_id: serverId }),
  );
};
