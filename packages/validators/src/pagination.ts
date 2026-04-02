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

import {
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
  MAX_ENTRIES_PER_PAGE,
} from "@virtbase/utils";
import * as z from "zod";

const paginationHint =
  "See [Pagination](#description/pagination) for more information.";

export const PaginationSchema = z
  .object({
    page: z
      .int()
      .positive()
      .default(DEFAULT_PAGE)
      .describe(`Current page number. ${paginationHint}`),
    per_page: z
      .int()
      .positive()
      .max(MAX_ENTRIES_PER_PAGE)
      .default(DEFAULT_PER_PAGE)
      .describe(`Number of entries per page. ${paginationHint}`),
    previous_page: z
      .int()
      .positive()
      .nullable()
      .describe(`Page number of the previous page, if any. ${paginationHint}`),
    next_page: z
      .int()
      .positive()
      .nullable()
      .describe(`Page number of the next page, if any. ${paginationHint}`),
    last_page: z
      .int()
      .positive()
      .nullable()
      .describe(`Page number of the last page, if any. ${paginationHint}`),
    total_entries: z
      .int()
      .min(0)
      .describe(`Total number of entries. ${paginationHint}`),
  })
  .describe(paginationHint);

export type PaginationMeta = z.infer<typeof PaginationSchema>;

/**
 * Get the pagination meta for a list endpoint.
 *
 * @param total The total number of entries.
 * @param page The current page number.
 * @param perPage The number of entries per page.
 * @returns The pagination meta.
 */
export const getPaginationMeta = ({
  total,
  page,
  perPage,
}: {
  total: number;
  page: number;
  perPage: number;
}): PaginationMeta => {
  const pageCount = Math.ceil(total / perPage);

  return {
    page,
    per_page: perPage,
    previous_page: page > 1 ? page - 1 : null,
    next_page: page < pageCount ? page + 1 : null,
    last_page: pageCount > 0 ? pageCount : null,
    total_entries: total,
  };
};
