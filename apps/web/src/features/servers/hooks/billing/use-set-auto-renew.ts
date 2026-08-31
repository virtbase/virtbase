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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";

type TRPC = ReturnType<typeof useTRPC>;
type Options = Parameters<
  TRPC["subscriptions"]["setAutoRenew"]["mutationOptions"]
>[0];

/**
 * Turns automatic renewal on or off.
 *
 * Deliberately not optimistic. Turning it *on* has preconditions the server
 * checks - a usable credential and a recorded mandate - and it answers
 * `PRECONDITION_FAILED` naming whichever is missing. A switch that flips
 * itself on and then flips back is the worst possible rendering of that: the
 * customer sees the state they asked for, looks away, and is not enrolled.
 *
 * No `meta.errorMessage` either. The refusal is specific and actionable, so
 * the call site shows it next to the switch with a way to fix it, rather than
 * in a toast that has gone by the time they scroll.
 */
export const useSetAutoRenew = ({
  mutationConfig,
}: {
  mutationConfig?: Options;
} = {}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onSettled, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.subscriptions.setAutoRenew.mutationOptions({
      ...rest,
      onSettled: async (...args) => {
        await queryClient.invalidateQueries(
          trpc.subscriptions.list.queryFilter(),
        );

        onSettled?.(...args);
      },
    }),
  );
};
