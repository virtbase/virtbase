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

import type { ApiKey } from "@better-auth/api-key/client";
import { Button } from "@virtbase/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { LucideCode } from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { useRouter } from "next/navigation";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { use, useTransition } from "react";
import { authClient } from "@/lib/auth/client";
import { ItemRow } from "../item-row";

export function ApiKeysList({
  promise,
}: {
  promise: Promise<Omit<ApiKey, "key">[]>;
}) {
  const t = useExtracted();

  const apiKeys = use(promise);

  if (!apiKeys.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideCode aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No API keys")}</EmptyTitle>
          <EmptyDescription>
            {t("No API keys have been created yet.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return apiKeys.map((apiKey) => {
    return <ApiKeyItem key={apiKey.id} apiKey={apiKey} />;
  });
}

function ApiKeyItem({ apiKey }: { apiKey: Omit<ApiKey, "key"> }) {
  const t = useExtracted();
  const router = useRouter();

  const format = useFormatter();
  const now = useNow({ updateInterval: 1000 });

  const [isPending, startTransition] = useTransition();

  const removeApiKey = (id: string) =>
    startTransition(async () => {
      await authClient.apiKey.delete({
        keyId: id,
        fetchOptions: {
          onSuccess: () => {
            router.refresh();
          },
        },
      });
    });

  return (
    <ItemRow
      icon={<LucideCode className="size-6 shrink-0" />}
      rightSide={
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <p className="text-sm">
            {t("Created {date}", {
              date: format.relativeTime(apiKey.createdAt, now),
            })}
          </p>
          <Button
            variant="outline"
            onClick={() => removeApiKey(apiKey.id)}
            disabled={isPending}
          >
            {isPending ? <Spinner /> : t("Delete")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">{apiKey.name}</p>
        <p className="text-muted-foreground text-sm leading-none">
          {apiKey.start}...
        </p>
      </div>
    </ItemRow>
  );
}
