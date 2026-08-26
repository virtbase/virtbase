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

export const useDeletionStatus = () => {
  const trpc = useTRPC();

  return useQuery(trpc.privacy.deletionStatus.queryOptions());
};

const useInvalidate = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.privacy.deletionStatus.queryOptions()),
      queryClient.invalidateQueries(trpc.stepUp.status.queryOptions()),
    ]);
  };
};

export const useRequestDeletion = () => {
  const trpc = useTRPC();
  const invalidate = useInvalidate();

  return useMutation(
    trpc.privacy.requestDeletion.mutationOptions({ onSuccess: invalidate }),
  );
};

export const useCancelDeletion = () => {
  const trpc = useTRPC();
  const invalidate = useInvalidate();

  return useMutation(
    trpc.privacy.cancelDeletion.mutationOptions({ onSuccess: invalidate }),
  );
};
