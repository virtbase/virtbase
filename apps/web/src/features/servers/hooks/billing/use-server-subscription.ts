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
import type { RouterOutputs } from "@virtbase/api";
import { useTRPC } from "@/lib/trpc/react";

export type Subscription =
  RouterOutputs["subscriptions"]["list"]["subscriptions"][number];

/**
 * The standing agreement that pays for one server.
 *
 * `subscriptions.list` is the only read there is - the router deliberately
 * offers no by-id query, because an id from a client is a filter and never a
 * selector - so the picking happens here. At most one subscription per subject
 * is live at a time (`subscriptions_subject_live_index` is partial on
 * `status <> 'ended'`), which is why "the live one, else the newest" is a total
 * answer rather than a guess: a server that has been let go and picked up again
 * has history, and the history is not what a billing card is about.
 */
export const useServerSubscription = (serverId: string) => {
  const trpc = useTRPC();

  return useQuery(
    trpc.subscriptions.list.queryOptions(undefined, {
      select: ({ subscriptions }) => {
        const mine = subscriptions.filter(
          (subscription) =>
            "server" === subscription.subject_type &&
            subscription.subject_id === serverId,
        );

        return (
          mine.find((subscription) => "ended" !== subscription.status) ??
          mine[0] ??
          null
        );
      },
    }),
  );
};
