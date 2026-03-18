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

import type { Passkey } from "@better-auth/passkey";
import { Button } from "@virtbase/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { LucideKey } from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { cache, use, useTransition } from "react";
import aaguidsMap from "@/features/account/assets/aaguid.json";
import { authClient } from "@/lib/auth/client";

export function UserPasskeysList({ promise }: { promise: Promise<Passkey[]> }) {
  const t = useExtracted();

  const passkeys = use(promise);

  if (!passkeys.length) {
    return (
      <Empty className="border" data-testid="empty-passkeys">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideKey aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No passkeys")}</EmptyTitle>
          <EmptyDescription>
            {t("No passkeys have been registered for this account.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return passkeys.map((passkey, index) => {
    return <PasskeyItem key={passkey.id} passkey={passkey} index={index} />;
  });
}

function PasskeyItem({ passkey, index }: { passkey: Passkey; index: number }) {
  const t = useExtracted();
  const router = useRouter();

  const format = useFormatter();
  const now = useNow({ updateInterval: 1_000 });

  const [isPending, startTransition] = useTransition();

  const removePasskey = (id: string) =>
    startTransition(async () => {
      await authClient.passkey.deletePasskey({
        id,
        fetchOptions: {
          onSuccess: () => {
            router.refresh();
          },
        },
      });
    });

  const branding = getPasskeyBrandingByAaguid(passkey.aaguid);

  return (
    <div
      className="-m-px overflow-hidden border bg-background p-6 first:rounded-t-md last:rounded-b-md"
      data-testid="passkey-item"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-4 truncate">
          <div
            className="grid size-10 place-items-center rounded-full bg-muted p-2"
            data-testid="passkey-icon"
          >
            {branding?.icon_dark ? (
              <NextImage
                src={branding.icon_dark}
                alt={branding.name}
                width={24}
                height={24}
                unoptimized
                className="pointer-events-none size-6 shrink-0 select-none object-cover"
                draggable={false}
              />
            ) : (
              <LucideKey className="size-6 shrink-0" />
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1 truncate">
            <p
              className="truncate font-medium text-sm"
              data-testid="passkey-name"
            >
              {branding?.name ||
                passkey.name ||
                t("Passkey #{number}", { number: String(index + 1) })}
            </p>
            <p
              className="truncate text-muted-foreground text-sm leading-none"
              data-testid="passkey-aaguid"
            >
              {passkey.aaguid}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <p
            className="whitespace-nowrap text-sm"
            data-testid="passkey-created-at"
            suppressHydrationWarning
          >
            {t("Added {date}", {
              date: format.relativeTime(passkey.createdAt, now),
            })}
          </p>
          <Button
            variant="outline"
            onClick={() => removePasskey(passkey.id)}
            disabled={isPending}
            data-testid="passkey-remove-button"
          >
            {isPending ? <Spinner /> : t("Remove")}
          </Button>
        </div>
      </div>
    </div>
  );
}

const getPasskeyBrandingByAaguid = cache((aaguid?: string | null) => {
  if (!aaguid || !(aaguid in aaguidsMap)) return null;

  return aaguidsMap[aaguid as keyof typeof aaguidsMap] as {
    name: string;
    icon_dark?: string;
  };
});
