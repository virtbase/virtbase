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
  TRPC["server"]["firewall"]["options"]["update"]["mutationOptions"]
>[0];

interface UpdateFirewallOptionsOptions {
  mutationConfig?: Options;
}

export const useUpdateFirewallOptions = ({
  mutationConfig,
}: UpdateFirewallOptionsOptions = {}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onMutate, onError, onSettled, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.server.firewall.options.update.mutationOptions({
      ...rest,
      onMutate: async (input, ...args) => {
        await queryClient.cancelQueries(
          trpc.server.firewall.options.get.queryFilter({
            server_id: input.server_id,
          }),
        );

        const previousData = queryClient.getQueryData(
          trpc.server.firewall.options.get.queryKey({
            server_id: input.server_id,
          }),
        );

        queryClient.setQueryData(
          trpc.server.firewall.options.get.queryKey({
            server_id: input.server_id,
          }),
          (old) =>
            !old
              ? undefined
              : {
                  options: {
                    ...old.options,
                    ...input,
                  },
                },
        );

        onMutate?.(input, ...args);

        return { previousData };
      },
      onError: async (error, input, ctx, ...args) => {
        queryClient.setQueryData(
          trpc.server.firewall.options.get.queryKey({
            server_id: input.server_id,
          }),
          ctx?.previousData,
        );

        onError?.(error, input, ctx, ...args);
      },
      onSettled: async (data, error, input, ...args) => {
        await queryClient.invalidateQueries(
          trpc.server.firewall.options.get.queryFilter({
            server_id: input.server_id,
          }),
        );

        onSettled?.(data, error, input, ...args);
      },
    }),
  );
};
