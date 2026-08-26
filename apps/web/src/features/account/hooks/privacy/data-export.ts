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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";

/**
 * The customer's most recent export.
 *
 * Polls only while one is being built. An export takes one call to the
 * accounting provider per invoice, so "a few seconds" and "a couple of
 * minutes" are both normal - but once it settles there is nothing to watch.
 */
export const useLatestDataExport = () => {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.privacy.latestExport.queryOptions({}),
    refetchInterval: ({ state }) => {
      const status = state.data?.export?.status;
      return status === "pending" || status === "building" ? 3000 : false;
    },
  });
};

export const useRequestDataExport = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.privacy.requestExport.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(
            trpc.privacy.latestExport.queryOptions({}),
          ),
          // Requesting spends the re-authentication, so the dialog must ask
          // again next time rather than trusting a stale "satisfied".
          queryClient.invalidateQueries(trpc.stepUp.status.queryOptions()),
        ]);
      },
    }),
  );
};
