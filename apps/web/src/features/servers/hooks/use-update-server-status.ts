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
import { ProxmoxTaskStatus } from "@virtbase/utils";
import type { UpdateServerStatusInput } from "@virtbase/validators/server";
import { useTRPC } from "@/lib/trpc/react";

type TRPC = ReturnType<typeof useTRPC>;
type Options = Parameters<
  TRPC["servers"]["status"]["update"]["mutationOptions"]
>[0];

interface UpdateServerStatusOptions {
  mutationConfig?: Options;
}

const actionToTaskStatusMapping = {
  start: ProxmoxTaskStatus.STARTING,
  stop: ProxmoxTaskStatus.STOPPING,
  pause: ProxmoxTaskStatus.PAUSING,
  resume: ProxmoxTaskStatus.RESUMING,
  suspend: ProxmoxTaskStatus.SUSPENDING,
  reset: ProxmoxTaskStatus.RESETTING,
  reboot: ProxmoxTaskStatus.REBOOTING,
  shutdown: ProxmoxTaskStatus.SHUTTING_DOWN,
} satisfies Record<UpdateServerStatusInput["action"], ProxmoxTaskStatus>;

export const useUpdateServerStatus = ({
  mutationConfig,
}: UpdateServerStatusOptions = {}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onMutate, onError, onSettled, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.servers.status.update.mutationOptions({
      ...rest,
      onMutate: async (input, ...args) => {
        await queryClient.cancelQueries(
          trpc.servers.status.get.queryFilter({
            server_id: input.server_id,
          }),
        );

        const previousData = queryClient.getQueryData(
          trpc.servers.status.get.queryKey({
            server_id: input.server_id,
          }),
        );

        queryClient.setQueryData(
          trpc.servers.status.get.queryKey({
            server_id: input.server_id,
          }),
          (old) =>
            !old
              ? undefined
              : {
                  status: {
                    ...old.status,
                    task: actionToTaskStatusMapping[input.action] ?? null,
                  },
                },
        );

        onMutate?.(input, ...args);

        return { previousData };
      },
      onError: async (error, input, ctx, ...args) => {
        queryClient.setQueryData(
          trpc.servers.status.get.queryKey({
            server_id: input.server_id,
          }),
          ctx?.previousData,
        );

        onError?.(error, input, ctx, ...args);
      },
      onSettled: async (data, error, input, ...args) => {
        await queryClient.invalidateQueries(
          trpc.servers.status.get.queryFilter({
            server_id: input.server_id,
          }),
        );

        onSettled?.(data, error, input, ...args);
      },
    }),
  );
};
