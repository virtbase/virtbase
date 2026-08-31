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

import { useSuspenseQuery } from "@tanstack/react-query";
import type { RouterOutputs } from "@virtbase/api";
import { useTRPC } from "@/lib/trpc/react";

export type GetPaymentMethodsListOutput =
  RouterOutputs["paymentMethods"]["list"];

/**
 * One saved credential as the dashboard is allowed to see it.
 *
 * Display material only - there is no `provider` and no `external_id` on the
 * wire, and nothing in this feature may add one. See
 * `PaymentMethodSchema` in `@virtbase/validators`.
 */
export type PaymentMethodSummary =
  GetPaymentMethodsListOutput["payment_methods"][number];

/**
 * The caller's own saved credentials.
 *
 * Suspense, like `useSSHKeysList`: the card prefetches on the server and
 * hydrates, so the list is never a spinner on first paint. The procedure takes
 * no input - the session is the filter.
 */
export const usePaymentMethodsList = () => {
  const trpc = useTRPC();

  return useSuspenseQuery(trpc.paymentMethods.list.queryOptions());
};
