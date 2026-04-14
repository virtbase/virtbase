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

import dynamic from "next/dynamic";
import { useServerActionState } from "../../hooks/use-server-action-state";

const RenameServerDialog = dynamic(() => import("./rename-server-dialog"), {
  ssr: false,
});

const NodeDetailsDialog = dynamic(() => import("./node-details-dialog"), {
  ssr: false,
});

const ResetRootPasswordDialog = dynamic(
  () => import("./reset-root-password-dialog"),
  {
    ssr: false,
  },
);

export function ServerDetailsActions() {
  const { action, setAction } = useServerActionState();

  return (
    <>
      {action === "rename" && (
        <RenameServerDialog
          onOpenChange={(open) => setAction(open ? "rename" : null)}
          open
        />
      )}
      {action === "view-node-details" && (
        <NodeDetailsDialog
          onOpenChange={(open) => setAction(open ? "view-node-details" : null)}
          open
        />
      )}
      {action === "reset-root-password" && (
        <ResetRootPasswordDialog
          onOpenChange={(open) =>
            setAction(open ? "reset-root-password" : null)
          }
          open
        />
      )}
    </>
  );
}
