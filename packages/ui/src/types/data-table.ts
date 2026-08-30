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

import type {
  ColumnSort,
  RowData,
  TableFeatures,
  Cell as TanstackCell,
  Column as TanstackColumn,
  ColumnDef as TanstackColumnDef,
  Row as TanstackRow,
  Table as TanstackTable,
} from "@tanstack/react-table";
import type { DataTableConfig } from "../config/data-table";
import type { FilterItemSchema } from "../lib/parsers";
import type { DataTableFeatures } from "../lib/table-features";

/**
 * The table types, with the app's feature set already applied.
 *
 * Every v9 type takes the feature set as its first generic. Threading
 * `typeof dataTableFeatures` through forty call sites would say nothing at any
 * of them - there is only ever one feature set (see `../lib/table-features`) -
 * so it is bound once here and call sites keep the v8 arity they already read
 * well at: `ColumnDef<Server>`, `Row<Invoice>`, `Table<AbuseCase>`.
 */
export type Table<TData extends RowData> = TanstackTable<
  DataTableFeatures,
  TData
>;

export type Row<TData extends RowData> = TanstackRow<DataTableFeatures, TData>;

export type Column<TData extends RowData, TValue = unknown> = TanstackColumn<
  DataTableFeatures,
  TData,
  TValue
>;

export type ColumnDef<
  TData extends RowData,
  TValue = unknown,
> = TanstackColumnDef<DataTableFeatures, TData, TValue>;

export type Cell<TData extends RowData, TValue = unknown> = TanstackCell<
  DataTableFeatures,
  TData,
  TValue
>;

declare module "@tanstack/react-table" {
  interface TableMeta<TFeatures extends TableFeatures, TData extends RowData> {
    queryKeys?: QueryKeys;
  }

  interface ColumnMeta<
    TFeatures extends TableFeatures,
    TData extends RowData,
    TValue,
  > {
    label?: string;
    placeholder?: string;
    variant?: FilterVariant;
    options?: Option[];
    range?: [number, number];
    unit?: string;
    icon?: React.FC<React.SVGProps<SVGSVGElement>>;
  }
}

export interface QueryKeys {
  page: string;
  perPage: string;
  sort: string;
  filters: string;
  joinOperator: string;
}

export interface Option {
  label: string;
  value: string;
  count?: number;
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

export type FilterOperator = DataTableConfig["operators"][number];
export type FilterVariant = DataTableConfig["filterVariants"][number];
export type JoinOperator = DataTableConfig["joinOperators"][number];

export interface ExtendedColumnSort<TData extends RowData>
  extends Omit<ColumnSort, "id"> {
  id: Extract<keyof TData, string>;
}

export interface ExtendedColumnFilter<TData> extends FilterItemSchema {
  id: Extract<keyof TData, string>;
}

export interface DataTableRowAction<
  TData extends RowData,
  TVariant = "update" | "delete",
> {
  row: Row<TData>;
  variant: TVariant;
}
