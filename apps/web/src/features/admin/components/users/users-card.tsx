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
  getUserRoleCounts,
  getUsersList,
  getUserVerifiedCounts,
} from "@/features/admin/api/users/get-users-list";
import { UsersTable } from "@/features/admin/components/users/users-table";
import { searchParamsCache } from "../../lib/users/validations";

export async function UsersCard(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const search = searchParamsCache.parse(searchParams);

  const validFilters = getValidFilters(search.filters);

  return (
    <UsersTable
      promises={Promise.all([
        getUsersList({ ...search, filters: validFilters }),
        getUserRoleCounts(),
        getUserVerifiedCounts(),
      ])}
    />
  );
}
