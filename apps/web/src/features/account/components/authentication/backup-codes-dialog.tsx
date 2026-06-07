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
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { useExtracted } from "next-intl";
import { CopyButton } from "@/ui/copy-button";

export default function BackupCodesDialog({
  backupCodes,
  ...props
}: Omit<
  React.ComponentProps<typeof ResponsiveDialog>,
  "title" | "description" | "footer"
> & { backupCodes: string[] }) {
  const t = useExtracted();

  const title = t("Backup Codes");

  return (
    <ResponsiveDialog
      title={title}
      description={title}
      footer={
        <Button variant="outline" onClick={() => props.onOpenChange?.(false)}>
          {t("Close")}
        </Button>
      }
      {...props}
    >
      <div className="flex flex-col gap-4 overflow-hidden">
        <p className="text-balance text-center text-muted-foreground text-sm">
          {t(
            "These are your backup codes. Store them in a secure location. You will need them to access your account if you lose your authenticator app.",
          )}
        </p>
        <div className="p-4">
          <div className="flex flex-row items-center justify-center gap-2">
            <div className="grid grid-cols-2 gap-4">
              {backupCodes.map((code) => (
                <p
                  key={code}
                  className="select-all whitespace-pre-wrap break-all text-center font-mono text-sm"
                >
                  {code}
                </p>
              ))}
            </div>
            <CopyButton value={backupCodes.join("\n")} />
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
