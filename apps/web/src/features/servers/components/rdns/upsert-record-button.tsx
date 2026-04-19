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
import { isSuspended, isTerminated } from "@virtbase/utils";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import type React from "react";
import { useServerActionState } from "../../hooks/use-server-action-state";
import { useServerStatus } from "../../hooks/use-server-status";

const UpsertRecordDialog = dynamic(() => import("./upsert-record-dialog"), {
  ssr: false,
});

export function UpsertRecordButton({
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
          setAction("upsert-record");
          onClick?.(event);
        }}
        disabled={
          action === "upsert-record" ||
          isPending ||
          !status ||
          isSuspended(status) ||
          isTerminated(status) ||
          disabled
        }
        {...props}
      >
        {children}
      </Button>
      {action === "upsert-record" && (
        <UpsertRecordDialog
          onOpenChange={(open) => setAction(open ? "upsert-record" : null)}
          open
        />
      )}
    </>
  );
}
