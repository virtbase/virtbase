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
  TRPC["subscriptions"]["retryNow"]["mutationOptions"]
>[0];

/**
 * Asks for the failing collection to be attempted again, now.
 *
 * Rate limited to three an hour on the server, because every press is a real
 * charge presented to a real issuer. The call site says what happened from the
 * `outcome` the mutation returns - "submitted", "your bank wants you", "still
 * declined" are three different answers and a single "done" toast would be
 * wrong for two of them.
 */
export const useRetryRenewal = ({
  mutationConfig,
}: {
  mutationConfig?: Options;
} = {}) => {
  const t = useExtracted();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onSettled, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.subscriptions.retryNow.mutationOptions({
      meta: { errorMessage: t("Could not retry the payment.") },
      ...rest,
      onSettled: async (...args) => {
        await queryClient.invalidateQueries(
          trpc.subscriptions.list.queryFilter(),
        );

        onSettled?.(...args);
      },
    }),
  );
};
