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
  TRPC["servers"]["actions"]["changeTemplate"]["mutationOptions"]
>[0];

interface ChangeTemplateOptions {
  mutationConfig?: Options;
}

export const useChangeTemplate = ({
  mutationConfig,
}: ChangeTemplateOptions = {}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onSuccess, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.servers.actions.changeTemplate.mutationOptions({
      ...rest,
      onSuccess: async (data, input, ...args) => {
        // Update the server status for top bar update
        await Promise.all([
          queryClient.invalidateQueries(
            trpc.servers.get.queryFilter({
              server_id: input.server_id,
            }),
          ),
          queryClient.invalidateQueries(
            trpc.servers.status.get.queryFilter({
              server_id: input.server_id,
            }),
          ),
        ]);

        onSuccess?.(data, input, ...args);
      },
    }),
  );
};
