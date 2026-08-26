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
 * Whether the customer still needs to prove who they are, and how they can.
 *
 * Not a suspense query: the dialog that reads it is opened in response to a
 * click, and suspending the whole page at that moment would be worse than a
 * dialog that fills in a beat later.
 */
export const useStepUpStatus = () => {
  const trpc = useTRPC();

  return useQuery(trpc.stepUp.status.queryOptions());
};

export const useVerifyStepUpPassword = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.stepUp.verifyPassword.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.stepUp.status.queryOptions());
      },
    }),
  );
};
