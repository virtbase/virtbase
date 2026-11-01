/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { DataTableSkeleton } from "@virtbase/ui/data-table";
import type { SortableColumns } from "@virtbase/utils";
import type { Invoice } from "@virtbase/validators";
import type { SearchParams } from "nuqs";
import { InvoicesTable } from "@/features/invoices/components/invoices-table/index.tsx";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server.tsx";
import { searchParamsCache } from "../lib/validations.ts";

export function InvoicesCardSkeleton() {
  return (
    <DataTableSkeleton
      columnCount={4}
      filterCount={2}
      cellWidths={["10rem", "10rem", "10rem", "6rem"]}
      shrinkZero
    />
  );
}

export async function InvoicesCard(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const search = await searchParamsCache.parse(searchParams);
  const refinedSearch = {
    ...search,
    total: search.total ? search.total * 100 : undefined,
    sort: search.sort.map(
      ({ id, desc }) =>
        `${id.replace(/([A-Z])/g, "_$1").toLowerCase()}:${desc ? "desc" : "asc"}`,
    ) as SortableColumns<Invoice>,
  };

  prefetch(trpc.invoices.list.queryOptions(refinedSearch));

  return (
    <HydrateClient fallback={<InvoicesCardSkeleton />}>
      <InvoicesTable search={refinedSearch} />
    </HydrateClient>
  );
}
