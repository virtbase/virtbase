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
  TRPC["servers"]["backups"]["update"]["mutationOptions"]
>[0];

interface UpdateBackupOptions {
  mutationConfig?: Options;
}

export const useUpdateBackup = ({
  mutationConfig,
}: UpdateBackupOptions = {}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onMutate, onError, onSettled, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.servers.backups.update.mutationOptions({
      ...rest,
      onMutate: async (input, ...args) => {
        await queryClient.cancelQueries(
          trpc.servers.backups.list.queryFilter({
            server_id: input.server_id,
          }),
        );

        const previousData = queryClient.getQueryData(
          trpc.servers.backups.list.queryKey({
            server_id: input.server_id,
          }),
        );

        queryClient.setQueryData(
          trpc.servers.backups.list.queryKey({
            server_id: input.server_id,
          }),
          (old) =>
            !old
              ? undefined
              : {
                  ...old,
                  backups: old.backups.map((backup) =>
                    backup.id === input.backup_id
                      ? {
                          ...backup,
                          ...input,
                        }
                      : backup,
                  ),
                },
        );

        onMutate?.(input, ...args);

        return { previousData };
      },
      onError: async (error, input, ctx, ...args) => {
        queryClient.setQueryData(
          trpc.servers.backups.list.queryKey({
            server_id: input.server_id,
          }),
          ctx?.previousData,
        );

        onError?.(error, input, ctx, ...args);
      },
      onSettled: async (data, error, input, ...args) => {
        await queryClient.invalidateQueries(
          trpc.servers.backups.list.queryFilter({
            server_id: input.server_id,
          }),
        );

        onSettled?.(data, error, input, ...args);
      },
    }),
  );
};
