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

import { Button } from "@virtbase/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { LucideUserKey } from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { ItemRow } from "@/features/account/components/item-row";
import { useDeleteSSHKey } from "@/features/account/hooks/ssh-keys/delete-ssh-key";
import type { GetSSHKeysListOutput } from "@/features/account/hooks/ssh-keys/ssh-keys-list";
import { useSSHKeysList } from "@/features/account/hooks/ssh-keys/ssh-keys-list";

export function SSHKeysList() {
  const t = useExtracted();

  const {
    data: { ssh_keys: sshKeys },
  } = useSSHKeysList();

  if (!sshKeys.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideUserKey aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No SSH keys")}</EmptyTitle>
          <EmptyDescription>
            {t("No SSH keys have been created yet.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return sshKeys.map((sshKey) => (
    <SSHKeyItem key={sshKey.id} sshKey={sshKey} />
  ));
}

function SSHKeyItem({
  sshKey,
}: {
  sshKey: GetSSHKeysListOutput["ssh_keys"][number];
}) {
  const t = useExtracted();

  const format = useFormatter();
  const now = useNow({ updateInterval: 1_000 });

  const { mutate: deleteSSHKey, isPending: isDeletingSSHKey } =
    useDeleteSSHKey();

  return (
    <ItemRow
      icon={<LucideUserKey className="size-6 shrink-0" />}
      rightSide={
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <p className="whitespace-nowrap text-sm" suppressHydrationWarning>
            {t("Created {date}", {
              date: format.relativeTime(sshKey.created_at, now),
            })}
          </p>
          <Button
            variant="outline"
            onClick={() => deleteSSHKey({ id: sshKey.id })}
            disabled={isDeletingSSHKey}
          >
            {isDeletingSSHKey ? <Spinner /> : t("Delete")}
          </Button>
        </div>
      }
    >
      <p className="truncate font-medium text-sm">{sshKey.name}</p>
      <p className="truncate text-muted-foreground text-sm leading-none">
        {sshKey.fingerprint}
      </p>
    </ItemRow>
  );
}
