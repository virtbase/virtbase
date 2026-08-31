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

"use client";

import { DataTable, DataTableToolbar } from "@virtbase/ui/data-table";
import { useDataTable } from "@virtbase/ui/hooks";
import { use } from "react";
import type {
  getSubscriptionStatusCounts,
  getSubscriptionsList,
} from "@/features/admin/api/subscriptions/get-subscriptions-list";
import { useSubscriptionsTableColumns } from "./columns";

interface SubscriptionsTableProps {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getSubscriptionsList>>,
      Awaited<ReturnType<typeof getSubscriptionStatusCounts>>,
    ]
  >;
}

export function SubscriptionsTable({ promises }: SubscriptionsTableProps) {
  const [subscriptions, statusCounts] = use(promises);
  const { data, pageCount } = subscriptions;

  const columns = useSubscriptionsTableColumns({ statusCounts });

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    // On, unlike the abuse queue's: this table has no default status filter to
    // preserve, so clearing a filter back to "everything" should drop it from
    // the URL rather than pin an empty list into the address bar.
    clearOnDefault: true,
    initialState: {
      // Soonest period end first. The subscription about to be collected is
      // the one somebody is asking about.
      sorting: [{ id: "currentPeriodEnd", desc: false }],
    },
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
}
