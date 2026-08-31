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
  TRPC["subscriptions"]["acceptMandate"]["mutationOptions"]
>[0];

/**
 * Records the customer's agreement to be charged while they are not present.
 *
 * No `meta.errorMessage`, and no optimistic update. The failure this can
 * actually produce - the wording moved on while the dialog was open - has to
 * be read where the wording is, not in a toast that outlives the dialog; the
 * opt-in flow renders it itself. Optimism is worse still: this writes the
 * artefact a payment dispute is decided on, and a UI that shows consent
 * recorded before the server has said so is a UI that can show it recorded
 * when it never was.
 */
export const useAcceptMandate = ({
  mutationConfig,
}: {
  mutationConfig?: Options;
} = {}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { onSettled, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.subscriptions.acceptMandate.mutationOptions({
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
