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
import { useExtracted } from "next-intl";
import { useTRPC } from "@/lib/trpc/react";

type TRPC = ReturnType<typeof useTRPC>;
type Options = Parameters<
  TRPC["paymentMethods"]["setDefault"]["mutationOptions"]
>[0];

interface SetDefaultPaymentMethodOptions {
  mutationConfig?: Options;
}

/**
 * Points renewals at another saved credential.
 *
 * Optimistic, the way renaming a server and reordering a firewall rule are:
 * the flag moves in the cache first and rolls back on failure. Exactly one row
 * carries it, so the update has to clear the others rather than only set the
 * one - a list showing two defaults for the length of a round trip is a list
 * that has answered "which card pays" twice.
 */
export const useSetDefaultPaymentMethod = ({
  mutationConfig,
}: SetDefaultPaymentMethodOptions = {}) => {
  const t = useExtracted();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onMutate, onError, onSettled, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.paymentMethods.setDefault.mutationOptions({
      meta: {
        errorMessage: t(
          "Could not change the default card. Nothing changed — try again.",
        ),
      },
      ...rest,
      onMutate: async (input, ...args) => {
        await queryClient.cancelQueries(trpc.paymentMethods.list.queryFilter());

        const previousData = queryClient.getQueryData(
          trpc.paymentMethods.list.queryKey(),
        );

        queryClient.setQueryData(trpc.paymentMethods.list.queryKey(), (old) =>
          !old
            ? undefined
            : {
                payment_methods: old.payment_methods.map((method) => ({
                  ...method,
                  is_default: method.id === input.id,
                })),
              },
        );

        onMutate?.(input, ...args);

        return { previousData };
      },
      onError: async (error, input, ctx, ...args) => {
        queryClient.setQueryData(
          trpc.paymentMethods.list.queryKey(),
          ctx?.previousData,
        );

        onError?.(error, input, ctx, ...args);
      },
      onSettled: async (data, error, input, ...args) => {
        await queryClient.invalidateQueries(
          trpc.paymentMethods.list.queryFilter(),
        );

        onSettled?.(data, error, input, ...args);
      },
    }),
  );
};
