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

import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";

type TRPC = ReturnType<typeof useTRPC>;
type Options = Parameters<
  TRPC["checkout"]["customCheckout"]["mutationOptions"]
>[0];

interface CustomCheckoutOptions {
  mutationConfig?: Options;
}

export function useCustomCheckout({
  mutationConfig,
}: CustomCheckoutOptions = {}) {
  const trpc = useTRPC();

  const { onSuccess, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.checkout.customCheckout.mutationOptions({
      ...rest,
      onSuccess: async (data, input, ...args) => {
        onSuccess?.(data, input, ...args);
        window.location.href = data.redirect_url;
      },
    }),
  );
}
