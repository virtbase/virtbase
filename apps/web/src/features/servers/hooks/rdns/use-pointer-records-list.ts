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
import type { RouterInputs, RouterOutputs } from "@virtbase/api";
import { MAX_ENTRIES_PER_PAGE } from "@virtbase/utils";
import { useTRPC } from "@/lib/trpc/react";

export type GetPointerRecordsListInput =
  RouterInputs["servers"]["rdns"]["list"];

export type GetPointerRecordsListOutput =
  RouterOutputs["servers"]["rdns"]["list"];

interface GetPointerRecordsList extends GetPointerRecordsListInput {
  queryConfig?: never;
}

export const defaultPointerRecordsListQuery = {
  sort: ["id:desc"],
  per_page: MAX_ENTRIES_PER_PAGE,
  expand: [],
} satisfies Omit<GetPointerRecordsListInput, "server_id">;

export const usePointerRecordsList = ({
  queryConfig,
  ...input
}: GetPointerRecordsList) => {
  const trpc = useTRPC();

  return useQuery(
    trpc.servers.rdns.list.queryOptions(
      {
        ...defaultPointerRecordsListQuery,
        ...input,
      },
      queryConfig,
    ),
  );
};
