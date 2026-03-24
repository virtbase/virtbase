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

"use client";

import { useMutation } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { useTRPC } from "@/lib/trpc/react";

export function useCheckoutState() {
  const trpc = useTRPC();

  const [clientSecret, setClientSecret] = useQueryState(
    "client_secret",
    parseAsString,
  );
  const [customerSessionClientSecret, setCustomerSessionClientSecret] =
    useQueryState("customer_session_client_secret", parseAsString);

  const { mutate: createOrder, isPending } = useMutation(
    trpc.checkout.order.mutationOptions({
      onSuccess: (data) => {
        setClientSecret(data.client_secret);
        setCustomerSessionClientSecret(data.customer_session_client_secret);
      },
    }),
  );

  return {
    clientSecret,
    setClientSecret,
    customerSessionClientSecret,
    setCustomerSessionClientSecret,
    createOrder,
    isPending,
  };
}
