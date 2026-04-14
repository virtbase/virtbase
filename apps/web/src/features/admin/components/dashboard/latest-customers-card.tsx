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
import { getLatestCustomers } from "@/features/admin/api/dashboard/get-latest-customers";
import { LatestCustomersList } from "@/features/admin/components/dashboard/latest-customers-list";
import { paths } from "@/lib/paths";

export function LatestCustomersCard() {
  const t = useExtracted();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Latest Customers")}</CardTitle>
        <CardDescription>{t("The latest customers by date")}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <NextLink
              href={paths.admin.users.getHref({ role: "CUSTOMER" })}
              prefetch={false}
            >
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
        <ErrorBoundary fallback={null}>
          <Suspense
            fallback={
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12" />
                ))}
              </div>
            }
          >
            <LatestCustomersList promise={getLatestCustomers()} />
          </Suspense>
        </ErrorBoundary>
      </CardContent>
    </Card>
  );
}
