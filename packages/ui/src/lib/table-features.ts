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
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFacetedMinMaxValues,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * The one feature set every table in the app is built from.
 *
 * TanStack Table v9 no longer bundles its features: a table only has the
 * methods whose feature was registered here, and every public type carries the
 * feature set as its first generic. That is a deliberate tree-shaking trade,
 * but it only pays off when tables can differ - and these cannot. The shared
 * chrome in `../data-table` (toolbar, pagination, view options, column header)
 * is written against *any* table, so it has to be able to reach pagination,
 * faceting, pinning and selection whichever table it was handed. One shared set
 * is therefore the architecture rather than a shortcut, and `../types` re-exports
 * the table types with it already applied so no call site spells it out.
 *
 * `filterFns` and `sortFns` are registered whole. Columns name their sort and
 * filter functions by string (or lean on `auto`), so the built-ins have to be
 * present under their conventional keys the way v8 always had them.
 */
export const dataTableFeatures = tableFeatures({
  columnFacetingFeature,
  columnFilteringFeature,
  // Carries `getIsFirstColumn`/`getIsLastColumn`, which the pinned-column
  // shadows in `./data-table` rely on.
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  // Row models come after the features they belong to, which is the order
  // `tableFeatures()` validates.
  facetedRowModel: createFacetedRowModel(),
  facetedMinMaxValues: createFacetedMinMaxValues(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns,
  sortFns,
});

export type DataTableFeatures = typeof dataTableFeatures;
