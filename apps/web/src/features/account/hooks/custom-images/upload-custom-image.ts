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
import { defaultGetCustomImagesListQuery } from "./use-custom-image-list";

type TRPC = ReturnType<typeof useTRPC>;
type Options = Parameters<TRPC["iso"]["upload"]["mutationOptions"]>[0];

interface UploadCustomImageOptions {
  mutationConfig?: Options;
}

export const useUploadCustomImage = ({
  mutationConfig,
}: UploadCustomImageOptions = {}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onSuccess, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.iso.upload.mutationOptions({
      ...rest,
      onSuccess: async (...args) => {
        await queryClient.invalidateQueries(
          trpc.iso.list.queryOptions(defaultGetCustomImagesListQuery),
        );

        onSuccess?.(...args);
      },
    }),
  );
};
