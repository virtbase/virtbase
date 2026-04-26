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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useExtracted } from "next-intl";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { LatestInvoicesList } from "@/features/dashboard/components/latest-invoices-list";
import { defaultGetLatestInvoicesQuery } from "@/features/dashboard/hooks/use-latest-invoices";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server";
import { GenericError } from "@/ui/generic-error";

export function LatestInvoicesCard() {
  const t = useExtracted();

  void prefetch(trpc.invoices.list.queryOptions(defaultGetLatestInvoicesQuery));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Latest Invoices")}</CardTitle>
        <CardDescription>
          {t("Here you can see your latest invoices for direct download.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <HydrateClient>
          <ErrorBoundary fallback={<GenericError className="border" />}>
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <LatestInvoicesList />
            </Suspense>
          </ErrorBoundary>
        </HydrateClient>
      </CardContent>
    </Card>
  );
}
