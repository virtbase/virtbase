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
import { Suspense, use } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server";
import { FirewallActionState } from "./firewall-action-state";

export function FirewallOptionsRow({ promise }: { promise: Promise<string> }) {
  const t = useExtracted();
  const serverId = use(promise);

  prefetch(
    trpc.server.firewall.options.get.queryOptions({ server_id: serverId }),
  );

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
            {t("The default action for incoming packages")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HydrateClient>
            {/** TODO: Add generic error fallback */}
            <ErrorBoundary fallback={null}>
              <Suspense fallback={<Skeleton className="h-8 w-32" />}>
                <FirewallActionState serverId={serverId} policy="policy_in" />
              </Suspense>
            </ErrorBoundary>
          </HydrateClient>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("Outgoing packets")}</CardTitle>
          <CardDescription>
            {t("The default action for outgoing packages")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HydrateClient>
            {/** TODO: Add generic error fallback */}
            <ErrorBoundary fallback={null}>
              <Suspense fallback={<Skeleton className="h-8 w-32" />}>
                <FirewallActionState serverId={serverId} policy="policy_out" />
              </Suspense>
            </ErrorBoundary>
          </HydrateClient>
        </CardContent>
      </Card>
    </div>
  );
}
