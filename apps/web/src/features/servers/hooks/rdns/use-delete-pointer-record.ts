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
import { defaultPointerRecordsListQuery } from "./use-pointer-records-list";

type TRPC = ReturnType<typeof useTRPC>;
type Options = Parameters<
  TRPC["servers"]["rdns"]["delete"]["mutationOptions"]
>[0];

interface DeletePointerRecordOptions {
  mutationConfig?: Options;
}

export const useDeletePointerRecord = ({
  mutationConfig,
}: DeletePointerRecordOptions = {}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onMutate, onError, onSettled, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.servers.rdns.delete.mutationOptions({
      ...rest,
      onMutate: async (input, ...args) => {
        await queryClient.cancelQueries(
          trpc.servers.rdns.list.queryFilter({
            ...defaultPointerRecordsListQuery,
            server_id: input.server_id,
          }),
        );

        const previousData = queryClient.getQueryData(
          trpc.servers.rdns.list.queryKey({
            ...defaultPointerRecordsListQuery,
            server_id: input.server_id,
          }),
        );

        queryClient.setQueryData(
          trpc.servers.rdns.list.queryKey({
            ...defaultPointerRecordsListQuery,
            server_id: input.server_id,
          }),
          (old) =>
            !old
              ? undefined
              : {
                  records: old.records.filter(
                    (record) => record.id !== input.id,
                  ),
                  meta: {
                    ...old.meta,
                    pagination: {
                      ...old.meta.pagination,
                      total_entries: old.meta.pagination.total_entries - 1,
                    },
                  },
                },
        );

        onMutate?.(input, ...args);

        return { previousData };
      },
      onError: async (error, input, ctx, ...args) => {
        queryClient.setQueryData(
          trpc.servers.rdns.list.queryKey({
            ...defaultPointerRecordsListQuery,
            server_id: input.server_id,
          }),
          ctx?.previousData,
        );

        onError?.(error, input, ctx, ...args);
      },
      onSettled: async (data, error, input, ...args) => {
        await queryClient.invalidateQueries(
          trpc.servers.rdns.list.queryFilter({
            ...defaultPointerRecordsListQuery,
            server_id: input.server_id,
          }),
        );

        onSettled?.(data, error, input, ...args);
      },
    }),
  );
};
