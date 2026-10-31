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

import { getValidFilters } from "@virtbase/ui/lib";
import type { SearchParams } from "nuqs";
import { getDatacentersList } from "../../api/datacenters/get-datacenters-list.ts";
import { searchParamsCache } from "../../lib/datacenters/validations.ts";
import { DatacentersTable } from "./datacenters-table/index.tsx";

export async function DatacentersCard(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const search = await searchParamsCache.parse(searchParams);

  const validFilters = getValidFilters(search.filters);

  return (
    <DatacentersTable
      promises={Promise.all([
        getDatacentersList({ ...search, filters: validFilters }),
      ])}
    />
  );
}
