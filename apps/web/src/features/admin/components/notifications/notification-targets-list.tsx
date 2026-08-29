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

import type { NotificationChannelDescription } from "@virtbase/api/notifications";
import { Button } from "@virtbase/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideBell,
  LucideMail,
  LucideMessageCircle,
  LucideWebhook,
} from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { ItemRow } from "@/features/account/components/item-row";
import type { NotificationTargetListItem } from "../../api/notifications/get-notification-settings";
import { deleteNotificationTargetAction } from "../../api/notifications/manage-notification-targets";
import { NotificationTargetDialog } from "./notification-target-dialog";

const CHANNEL_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  email: LucideMail,
  discord: LucideMessageCircle,
  webhook: LucideWebhook,
};

function TargetItem({
  target,
  channels,
}: {
  target: NotificationTargetListItem;
  channels: NotificationChannelDescription[];
}) {
  const t = useExtracted();
  const [editing, setEditing] = useState(false);

  // No success toast: the row disappears, which says it better than a message.
  const remove = useAction(deleteNotificationTargetAction, {
    onError: ({ error }) =>
      toast.error(error.serverError ?? t("Something went wrong.")),
  });

  const Icon = CHANNEL_ICONS[target.channel] ?? LucideBell;

  // Only one line of status, and the one that stops delivery wins: a target
  // whose channel is gone is not merely switched off.
  const status = !target.channelAvailable
    ? t("Channel unavailable")
    : target.enabled
      ? null
      : t("Disabled");

  return (
    <>
      <ItemRow
        icon={<Icon className="size-6 shrink-0" />}
        rightSide={
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            {status ? (
              <p className="whitespace-nowrap text-sm">{status}</p>
            ) : null}
            <Button variant="outline" onClick={() => setEditing(true)}>
              {t("Edit")}
            </Button>
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => remove.execute({ id: target.id })}
            >
              {remove.isPending ? <Spinner /> : t("Delete")}
            </Button>
          </div>
        }
      >
        <p className="truncate font-medium text-sm">{target.name}</p>
        <p className="truncate text-muted-foreground text-sm leading-none">
          {t("{keys} · {severity} and above", {
            keys: target.matchKeys.join(", "),
            severity: target.minSeverity,
          })}
        </p>
      </ItemRow>

      {editing ? (
        <NotificationTargetDialog
          target={target}
          channels={channels}
          open={editing}
          onOpenChange={setEditing}
        />
      ) : null}
    </>
  );
}

export function NotificationTargetsList({
  targets,
  channels,
  error,
}: {
  targets: NotificationTargetListItem[];
  channels: NotificationChannelDescription[];
  error: string | null;
}) {
  const t = useExtracted();
  const [creating, setCreating] = useState(false);

  const canAdd = !error && channels.length > 0;

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader>
        <CardTitle className="text-lg">{t("Notification targets")}</CardTitle>
        <CardDescription>
          {t(
            "Where operator alerts are delivered. Customers are notified through their own channels.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LucideBell aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("Targets unavailable")}</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : channels.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LucideBell aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("No channels")}</EmptyTitle>
              <EmptyDescription>
                {t("No integration providing a notification channel is on.")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : targets.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LucideBell aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("No targets")}</EmptyTitle>
              <EmptyDescription>
                {t("No notification targets have been created yet.")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          targets.map((target) => (
            <TargetItem key={target.id} target={target} channels={channels} />
          ))
        )}
      </CardContent>
      <CardFooter className="border-t bg-background [.border-t]:p-6">
        <div className="flex w-full flex-col items-center justify-center gap-4 lg:flex-row lg:justify-between">
          <p className="text-center text-muted-foreground text-sm">
            {t(
              "A target receives every notification matching its keys and minimum severity.",
            )}
          </p>
          <Button disabled={!canAdd} onClick={() => setCreating(true)}>
            {t("Add target")}
          </Button>
        </div>
      </CardFooter>

      {creating ? (
        <NotificationTargetDialog
          channels={channels}
          open={creating}
          onOpenChange={setCreating}
        />
      ) : null}
    </Card>
  );
}
