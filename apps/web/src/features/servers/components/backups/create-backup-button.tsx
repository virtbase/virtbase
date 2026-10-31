/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

"use client";

import { Button } from "@virtbase/ui/button";
import { isBusy, isOperational } from "@virtbase/utils";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import type React from "react";
import { useServerActionState } from "../../hooks/use-server-action-state.ts";
import { useServerStatus } from "../../hooks/use-server-status.ts";

const CreateBackupDialog = dynamic(() => import("./create-backup-dialog.tsx"), {
  ssr: false,
});

export function CreateBackupButton({
  disabled,
  onClick,
  size = "icon",
  variant = "outline",
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { id: serverId } = useParams<{ id: string }>();

  const { data: { status } = {}, isPending } = useServerStatus({
    server_id: serverId,
  });
  const { action, setAction } = useServerActionState();

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={(event) => {
          setAction("create-backup");
          onClick?.(event);
        }}
        disabled={
          action === "create-backup" ||
          isPending ||
          !status ||
          !isOperational(status) ||
          isBusy(status) ||
          disabled
        }
        {...props}
      >
        {children}
      </Button>
      {action === "create-backup" && (
        <CreateBackupDialog
          onOpenChange={(open) => setAction(open ? "create-backup" : null)}
          open
        />
      )}
    </>
  );
}
