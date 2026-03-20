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

import { Button } from "@virtbase/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { LucideExternalLink } from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import NextLink from "next/link";
import { useExtracted } from "next-intl";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { LatestInvoicesList } from "@/features/dashboard/components/latest-invoices-list";
import { defaultGetLatestInvoicesQuery } from "@/features/dashboard/hooks/use-latest-invoices";
import { paths } from "@/lib/paths";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server";

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
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <NextLink href={paths.app.invoices.getHref()} prefetch={false}>
              <LucideExternalLink
                className="text-muted-foreground"
                aria-hidden="true"
              />
              {t("View all")}
            </NextLink>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <HydrateClient>
          {/** TODO: Add generic error fallback */}
          <ErrorBoundary fallback={null}>
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <LatestInvoicesList />
            </Suspense>
          </ErrorBoundary>
        </HydrateClient>
      </CardContent>
    </Card>
  );
}
