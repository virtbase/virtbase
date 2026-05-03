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
import { GenericError } from "@/ui/generic-error";
import { getSalesByPlan } from "../../api/dashboard/get-sales-by-plan";
import { SalesByPlan } from "./sales-by-plan";

export function SalesByPlanCard() {
  const t = useExtracted();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Sales by Plan")}</CardTitle>
        <CardDescription>
          {t("Sales by plan in the last 30 days")}
        </CardDescription>
      </CardHeader>
      <CardContent className="h-72 flex-1 pb-0">
        <ErrorBoundary fallback={<GenericError className="border" />}>
          <Suspense fallback={<Skeleton className="size-full h-72" />}>
            <SalesByPlan promise={getSalesByPlan()} />
          </Suspense>
        </ErrorBoundary>
      </CardContent>
    </Card>
  );
}
