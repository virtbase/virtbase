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
import type { RouterInputs, RouterOutputs } from "@virtbase/api";
import { useTRPC } from "@/lib/trpc/react";

export type GetLatestInvoicesInput = RouterInputs["invoices"]["list"];

export type GetLatestInvoicesOutput = RouterOutputs["invoices"]["list"];

interface GetLatestInvoices extends GetLatestInvoicesInput {
  queryConfig?: never;
}

export const defaultGetLatestInvoicesQuery = {
  sort: ["id:desc"],
  per_page: 5,
} satisfies GetLatestInvoicesInput;

export const useLatestInvoices = ({
  queryConfig,
  ...input
}: GetLatestInvoices = {}) => {
  const trpc = useTRPC();

  return useSuspenseQuery(
    trpc.invoices.list.queryOptions(
      {
        ...defaultGetLatestInvoicesQuery,
        ...input,
      },
      queryConfig,
    ),
  );
};
