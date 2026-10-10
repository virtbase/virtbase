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
import { Switch } from "@virtbase/ui/switch";
import { useExtracted } from "next-intl";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server";
import { GenericErrorInline } from "@/ui/generic-error-inline";
import { FirewallActionState } from "./firewall-action-state";

async function FirewallPolicy({
  promise,
  policy,
}: {
  promise: Promise<string>;
  policy: "policy_in" | "policy_out";
}) {
  const serverId = await promise;

  prefetch(
    trpc.servers.firewall.options.get.queryOptions({ server_id: serverId }),
  );

  return (
    <HydrateClient fallback={<Skeleton className="h-8 w-32" />}>
      <FirewallActionState serverId={serverId} policy={policy} />
    </HydrateClient>
  );
}

export function FirewallOptionsRow({ promise }: { promise: Promise<string> }) {
  const t = useExtracted();

  return (
    <div className="grid auto-rows-min @2xl:grid-cols-3 gap-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("Status")}</CardTitle>
          <CardDescription>
            {t("The firewall is always enabled")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex h-8 items-center">
          <Switch checked disabled />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("Incoming packets")}</CardTitle>
          <CardDescription>
            {t("The default action for incoming packets")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ErrorBoundary fallback={<GenericErrorInline />}>
            <Suspense fallback={<Skeleton className="h-8 w-32" />}>
              <FirewallPolicy promise={promise} policy="policy_in" />
            </Suspense>
          </ErrorBoundary>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("Outgoing packets")}</CardTitle>
          <CardDescription>
            {t("The default action for outgoing packets")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ErrorBoundary fallback={<GenericErrorInline />}>
            <Suspense fallback={<Skeleton className="h-8 w-32" />}>
              <FirewallPolicy promise={promise} policy="policy_out" />
            </Suspense>
          </ErrorBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
