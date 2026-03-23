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
  TRPC["servers"]["firewall"]["rules"]["update"]["mutationOptions"]
>[0];

interface UpdateFirewallRuleOptions {
  mutationConfig?: Options;
}

export const useUpdateFirewallRule = ({
  mutationConfig,
}: UpdateFirewallRuleOptions = {}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onMutate, onError, onSettled, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.servers.firewall.rules.update.mutationOptions({
      ...rest,
      onMutate: async (input, ...args) => {
        await queryClient.cancelQueries(
          trpc.servers.firewall.rules.get.queryFilter({
            server_id: input.server_id,
          }),
        );

        const previousData = queryClient.getQueryData(
          trpc.servers.firewall.rules.get.queryKey({
            server_id: input.server_id,
          }),
        );

        queryClient.setQueryData(
          trpc.servers.firewall.rules.get.queryKey({
            server_id: input.server_id,
          }),
          (old) =>
            !old
              ? undefined
              : {
                  rules: old.rules.map((rule) =>
                    rule.pos === input.pos ? { ...rule, ...input } : rule,
                  ),
                },
        );

        onMutate?.(input, ...args);

        return { previousData };
      },
      onError: async (error, input, ctx, ...args) => {
        queryClient.setQueryData(
          trpc.servers.firewall.rules.get.queryKey({
            server_id: input.server_id,
          }),
          ctx?.previousData,
        );

        onError?.(error, input, ctx, ...args);
      },
      onSettled: async (data, error, input, ...args) => {
        await queryClient.invalidateQueries(
          trpc.servers.firewall.rules.get.queryFilter({
            server_id: input.server_id,
          }),
        );

        onSettled?.(data, error, input, ...args);
      },
    }),
  );
};
