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
import {
  getSubnetsList,
  getSubnetTypeCounts,
  getSubnetVlanCounts,
} from "@/features/admin/api/subnets/get-subnets-list";
import { SubnetsTable } from "@/features/admin/components/subnets/subnets-table";
import { searchParamsCache } from "@/features/admin/lib/subnets/validations";

export async function SubnetsCard(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const search = searchParamsCache.parse(searchParams);

  const validFilters = getValidFilters(search.filters);

  return (
    <SubnetsTable
      promises={Promise.all([
        getSubnetsList({ ...search, filters: validFilters }),
        getSubnetVlanCounts(),
        getSubnetTypeCounts(),
      ])}
    />
  );
}
