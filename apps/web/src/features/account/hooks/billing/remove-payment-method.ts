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
  TRPC["paymentMethods"]["remove"]["mutationOptions"]
>[0];

interface RemovePaymentMethodOptions {
  mutationConfig?: Options;
}

/**
 * Detaches a saved credential and drops it from the list.
 *
 * Optimistic and rolled back on failure, which is safe here because the
 * procedure detaches at the provider *before* it touches the row: a failure
 * means nothing was removed anywhere, so putting the row back is the truth
 * rather than a guess.
 *
 * The default is deliberately not reassigned in the cache. Removing the
 * default leaves the account with none - the server does not promote the next
 * card, because moving someone's renewals onto an instrument they never chose
 * is something they find out about on a statement - and the list has to say so
 * instead of quietly showing a new default.
 *
 * Subscriptions are invalidated alongside: `subscriptions.list` reports the
 * credential a renewal would charge, which is the account default when the
 * subscription names none.
 */
export const useRemovePaymentMethod = ({
  mutationConfig,
}: RemovePaymentMethodOptions = {}) => {
  const t = useExtracted();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onMutate, onError, onSettled, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.paymentMethods.remove.mutationOptions({
      meta: {
        errorMessage: t(
          "Could not remove the card. It is still on your account — try again in a moment.",
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
                payment_methods: old.payment_methods.filter(
                  (method) => method.id !== input.id,
                ),
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
        await Promise.all([
          queryClient.invalidateQueries(trpc.paymentMethods.list.queryFilter()),
          queryClient.invalidateQueries(trpc.subscriptions.list.queryFilter()),
        ]);

        onSettled?.(data, error, input, ...args);
      },
    }),
  );
};
