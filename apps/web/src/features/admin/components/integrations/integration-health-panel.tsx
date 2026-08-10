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

import { cn } from "@virtbase/ui";
import { Button } from "@virtbase/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted, useNow } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { useFormatter } from "use-intl";
import type { IntegrationListItem } from "../../api/integrations/get-integrations-list";
import { checkIntegrationHealthAction } from "../../api/integrations/update-integration";

export function IntegrationHealthPanel({
  item,
}: {
  item: IntegrationListItem;
}) {
  const t = useExtracted();
  const now = useNow({ updateInterval: 1000 });
  const format = useFormatter();

  const { descriptor, health } = item;

  const { execute, isPending } = useAction(checkIntegrationHealthAction, {
    onError: ({ error }) =>
      toast.error(error.serverError ?? t("Something went wrong.")),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{t("Status")}</CardTitle>
          <div
            className={cn("h-2.5 w-2.5 rounded-full", {
              "bg-green-500": health.status === "ok",
              "bg-red-500": health.status === "error",
              "bg-yellow-500": health.status === "degraded",
              "bg-gray-500": health.status === "unknown",
            })}
          />
        </div>
        <CardDescription className="leading-none" suppressHydrationWarning>
          {health.checkedAt
            ? t("Checked {date}", {
                date: format.relativeTime(health.checkedAt, now),
              })
            : t("Never checked")}
        </CardDescription>
        {descriptor.hasHealthCheck ? (
          <CardAction>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => execute({ integrationId: descriptor.id })}
            >
              {isPending ? <Spinner /> : t("Re-check")}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      {health.message ? (
        <CardContent>
          <code className="font-mono text-muted-foreground text-xs">
            {health.message}
          </code>
        </CardContent>
      ) : null}
    </Card>
  );
}
