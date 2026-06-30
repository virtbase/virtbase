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
import { Spinner } from "@virtbase/ui/spinner";
import dynamic from "next/dynamic";
import { useExtracted } from "next-intl";
import type React from "react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";

const ConfirmPasswordDialog = dynamic(
  () => import("./confirm-password-dialog"),
  { ssr: false },
);
const TwoFactorEnableDialog = dynamic(
  () => import("./two-factor-enable-dialog"),
  { ssr: false },
);
const BackupCodesDialog = dynamic(() => import("./backup-codes-dialog"), {
  ssr: false,
});

export function TwoFactorManageButton({
  terminology = "set-up",
  disabled,
  onConfirmed,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children" | "onClick"> & {
  terminology?: "set-up" | "replace";
  onConfirmed?: () => void;
}) {
  const t = useExtracted();

  const [open, setOpen] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const initiateTwoFactor = (password: string) =>
    startTransition(async () => {
      await authClient.twoFactor.enable({
        method: "totp",
        password,
        fetchOptions: {
          onSuccess: ({ data }) => {
            setOpen(false);
            setTotpUri(data.totpURI);
            setBackupCodes(data.backupCodes);
          },
          onError: ({ error }) => {
            toast.error(error.message);
            setInvalid(true);
          },
        },
      });
    });

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled || isPending || open}
        {...props}
      >
        {isPending && <Spinner />}{" "}
        {terminology === "set-up" ? t("Set Up") : t("Replace")}
      </Button>
      {open && (
        <ConfirmPasswordDialog
          onSubmit={(password) => initiateTwoFactor(password)}
          open={open}
          onOpenChange={setOpen}
          invalid={invalid}
        />
      )}
      {!!totpUri && (
        <TwoFactorEnableDialog
          open
          onOpenChange={() => setTotpUri(null)}
          totpUri={totpUri}
          onConfirmed={() => {
            setTotpUri(null);
            onConfirmed?.();
            setShowBackupCodes(true);
          }}
        />
      )}
      {showBackupCodes && backupCodes.length > 0 && (
        <BackupCodesDialog
          open
          onOpenChange={() => {
            setShowBackupCodes(false);
            setBackupCodes([]);
          }}
          backupCodes={backupCodes}
        />
      )}
    </>
  );
}
