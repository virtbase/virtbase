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

import { getValidFilters } from "@virtbase/ui/lib";
import type { SearchParams } from "nuqs";
import { getDatacentersList } from "../../api/datacenters/get-datacenters-list";
import { searchParamsCache } from "../../lib/datacenters/validations";
import { DatacentersTable } from "./datacenters-table";

export async function DatacentersCard(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const search = searchParamsCache.parse(searchParams);

  const validFilters = getValidFilters(search.filters);

  return (
    <DatacentersTable
      promises={Promise.all([
        getDatacentersList({ ...search, filters: validFilters }),
      ])}
    />
  );
}
