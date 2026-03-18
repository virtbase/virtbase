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
import { defaultGetSSHKeysListQuery } from "@/features/account/hooks/ssh-keys/ssh-keys-list";
import { useTRPC } from "@/lib/trpc/react";

interface DeleteSSHKeyOptions {
  mutationConfig?: Parameters<
    ReturnType<typeof useTRPC>["sshKeys"]["delete"]["mutationOptions"]
  >[0];
}

export const useDeleteSSHKey = ({
  mutationConfig,
}: DeleteSSHKeyOptions = {}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onSuccess, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.sshKeys.delete.mutationOptions({
      ...rest,
      onSuccess: async (...args) => {
        await queryClient.invalidateQueries(
          trpc.sshKeys.list.queryOptions(defaultGetSSHKeysListQuery),
        );

        onSuccess?.(...args);
      },
    }),
  );
};
