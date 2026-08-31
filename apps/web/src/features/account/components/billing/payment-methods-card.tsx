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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useExtracted } from "next-intl";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server";
import { GenericError } from "@/ui/generic-error";
import { AddPaymentMethod } from "./add-payment-method";
import { PaymentMethodsList } from "./payment-methods-list";

/**
 * The saved payment methods surface, on `/account/settings/billing`.
 *
 * Prefetched and hydrated the way `SSHKeysCard` is, so the list is markup on
 * first paint rather than a spinner. Subscriptions are prefetched beside it
 * because the remove confirmation needs them to say what a removal costs -
 * asking for them only when the dialog opens would show the warning a moment
 * after the customer has already read the buttons.
 */
export function PaymentMethodsCard() {
  const t = useExtracted();

  void prefetch(trpc.paymentMethods.list.queryOptions());
  void prefetch(trpc.subscriptions.list.queryOptions());

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader>
        <CardTitle className="text-lg">{t("Payment Methods")}</CardTitle>
        <CardDescription>
          {t("The cards your subscriptions renew on.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <HydrateClient>
          <ErrorBoundary fallback={<GenericError className="border" />}>
            <Suspense fallback={<Skeleton className="-m-px h-48 w-full" />}>
              <PaymentMethodsList />
            </Suspense>
          </ErrorBoundary>
        </HydrateClient>
      </CardContent>
      <CardFooter className="border-t bg-background [.border-t]:p-6">
        <Suspense fallback={<Skeleton className="h-9 w-full" />}>
          <AddPaymentMethod />
        </Suspense>
      </CardFooter>
    </Card>
  );
}
