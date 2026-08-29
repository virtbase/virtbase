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

/**
 * Both writes the customer can make, invalidating the same two queries.
 *
 * A reply can change the case's status - answering stops the response clock -
 * so the list has to be refetched as well as the case, or the queue still
 * shows a deadline that has already been met.
 */
const useCaseMutation = (id: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.abuse.get.queryOptions({ id })),
      queryClient.invalidateQueries(trpc.abuse.list.queryOptions()),
    ]);
  };
};

export const useReplyToAbuseCase = (id: string) => {
  const trpc = useTRPC();
  const invalidate = useCaseMutation(id);

  return useMutation(
    trpc.abuse.reply.mutationOptions({ onSuccess: invalidate }),
  );
};

export const useMarkAbuseCaseFixed = (id: string) => {
  const trpc = useTRPC();
  const invalidate = useCaseMutation(id);

  return useMutation(
    trpc.abuse.markMitigated.mutationOptions({ onSuccess: invalidate }),
  );
};
