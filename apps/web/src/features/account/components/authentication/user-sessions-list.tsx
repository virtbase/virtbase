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

import { Badge } from "@virtbase/ui/badge";
import { Button } from "@virtbase/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideMonitor,
  LucideSmartphone,
  LucideTablet,
  LucideTv,
  LucideUserX,
  LucideWatch,
} from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import type { Session } from "better-auth/types";
import { useRouter } from "next/navigation";
import { userAgentFromString } from "next/server";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { use, useTransition } from "react";
import { authClient } from "@/lib/auth/client";

const deviceTypes: Record<string, React.ElementType> = {
  mobile: LucideSmartphone,
  smarttv: LucideTv,
  wearable: LucideWatch,
  tablet: LucideTablet,
};

export function UserSessionsList({
  promises,
}: {
  promises: Promise<[Session | null, Session[]]>;
}) {
  const [currentSession, sessions] = use(promises);

  const t = useExtracted();

  if (!sessions.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideUserX className="size-5" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No sessions")}</EmptyTitle>
          <EmptyDescription>
            {t(
              "There are no active sessions. New logins will be displayed here.",
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return sessions.map((session) => {
    return (
      <SessionItem
        key={session.id}
        currentSession={currentSession}
        session={session}
      />
    );
  });
}

function SessionItem({
  currentSession,
  session,
}: {
  currentSession?: Pick<Session, "token"> | null;
  session: Session;
}) {
  const t = useExtracted();
  const router = useRouter();

  const [isPending, startTransition] = useTransition();

  const format = useFormatter();
  const now = useNow({ updateInterval: 1_000 });

  const revokeSession = (token: string) =>
    startTransition(async () => {
      if (currentSession?.token === token) {
        await authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              router.replace("/login");
            },
          },
        });
      }

      await authClient.revokeSession({
        token,
        fetchOptions: {
          onSuccess: () => {
            router.refresh();
          },
        },
      });
    });

  const isCurrent = currentSession?.token === session.token;

  const agent = session.userAgent
    ? userAgentFromString(session.userAgent)
    : null;

  const DeviceIcon = deviceTypes[agent?.device.type as string] || LucideMonitor;

  return (
    <div className="-m-px overflow-hidden border bg-background p-6 first:rounded-t-md last:rounded-b-md">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-4 truncate">
          <div className="grid size-10 place-items-center rounded-full bg-muted p-2">
            <DeviceIcon className="size-6 shrink-0" />
          </div>
          <div className="flex flex-1 flex-col gap-1 truncate">
            <div className="flex flex-wrap-reverse items-center gap-2">
              <p className="truncate font-medium text-sm">
                {agent
                  ? `${agent.browser.name}${agent.os.name ? ` (${[agent.os.name, agent.os.version].filter(Boolean).join(" ")})` : ""}`
                  : t("Unknown device")}
                {agent?.device.type}
              </p>
              {isCurrent && (
                <Badge className="rounded-full">{t("Current session")}</Badge>
              )}
            </div>
            <p className="truncate text-muted-foreground text-sm leading-none">
              {session.ipAddress || t("Unknown IP address")}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <p className="whitespace-nowrap text-sm" suppressHydrationWarning>
            {t("Signed in {date}", {
              date: format.relativeTime(session.updatedAt, now),
            })}
          </p>
          <Button
            variant="outline"
            onClick={() => revokeSession(session.token)}
            disabled={isPending}
          >
            {isPending ? <Spinner /> : t("Sign out")}
          </Button>
        </div>
      </div>
    </div>
  );
}
