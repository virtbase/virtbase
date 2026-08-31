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
  TRPC["subscriptions"]["cancel"]["mutationOptions"]
>[0];

/**
 * Cancels the subscription. One call, no gates - see §312k BGB.
 *
 * Nothing here may grow a confirmation, a retry prompt or a "are you sure":
 * the confirmation the statute allows is the one the customer has already
 * given by the time this runs. The server keeps the paid-for term, so a
 * success is not a loss of service and must never be reported as one.
 */
export const useCancelSubscription = ({
  mutationConfig,
}: {
  mutationConfig?: Options;
} = {}) => {
  const t = useExtracted();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onSettled, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.subscriptions.cancel.mutationOptions({
      meta: { errorMessage: t("Could not cancel the subscription.") },
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
