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
import { getPaymentMethodList } from "../../api/billing/get-payment-method-list";
import { PaymentMethodsList } from "./payment-methods-list";

export function PaymentMethodsCard() {
  const t = useExtracted();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("Payment Methods")}</CardTitle>
        <CardDescription>
          {t(
            "The following payment methods are stored and can be used for billing.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/** TODO: Add generic error fallback */}
        <ErrorBoundary fallback={null}>
          <Suspense fallback={<Skeleton className="-m-px h-48 w-full" />}>
            <PaymentMethodsList promise={getPaymentMethodList()} />
          </Suspense>
        </ErrorBoundary>
      </CardContent>
    </Card>
  );
}
