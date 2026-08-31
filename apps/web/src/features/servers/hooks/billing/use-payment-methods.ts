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

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";

/**
 * The customer's saved credentials, as the renewal opt-in needs to see them.
 *
 * Read here rather than taken from `subscription.payment_method`: that field
 * says *which* credential a renewal would charge and deliberately carries
 * neither `invalid_at` nor an expiry, so it cannot answer "would that charge
 * actually go through". `setAutoRenew` refuses a credential the provider has
 * marked dead, and a switch that fails on a card the page is happily showing
 * is worse than one that explains itself first.
 */
export const usePaymentMethods = () => {
  const trpc = useTRPC();

  return useQuery(trpc.paymentMethods.list.queryOptions());
};
