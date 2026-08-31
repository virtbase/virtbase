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
import { useMemo } from "react";
import { useTRPC } from "@/lib/trpc/react";

type Subscription =
  RouterOutputs["subscriptions"]["list"]["subscriptions"][number];

/** The statuses a renewal can still be attempted for. */
const RENEWABLE_STATUSES = new Set(["active", "past_due"]);

/**
 * The subscriptions a removal would leave with nothing to charge.
 *
 * A plain `useQuery` and never a suspense one: this only decorates the remove
 * confirmation with what the customer stands to lose, and a slow or broken
 * subscriptions query must not hold up - or take down - the card list beside
 * it. When it has no answer the dialog says less; it never says something
 * untrue and it never blocks the removal.
 */
export const useAutoRenewingSubscriptions = () => {
  const trpc = useTRPC();

  const query = useQuery(trpc.subscriptions.list.queryOptions());

  const subscriptions = useMemo(
    () =>
      (query.data?.subscriptions ?? []).filter(
        (subscription: Subscription) =>
          subscription.auto_renew &&
          RENEWABLE_STATUSES.has(subscription.status),
      ),
    [query.data],
  );

  return { ...query, subscriptions };
};
