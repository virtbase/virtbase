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

import { cn } from "@virtbase/ui";
import { Alert, AlertDescription } from "@virtbase/ui/alert";
import { AnimatedSizeContainer } from "@virtbase/ui/animated-size-container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import {
  LucideAlertOctagon,
  LucideBinary,
  LucideQrCode,
} from "@virtbase/ui/icons/index";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { ItemRow } from "../item-row";
import { RegenerateBackupCodesButton } from "./regenerate-backup-codes-button";
import { TwoFactorManageButton } from "./two-factor-manage-button";

export function UserTfaCard() {
  const t = useExtracted();

  const { data, isPending } = authClient.useSession();
  const [wasTwoFactorEnabled, setWasTwoFactorEnabled] = useState(false);

  const isTwoFactorEnabled =
    data?.user?.twoFactorEnabled || wasTwoFactorEnabled;

  return (
    <Card
      className={cn(
        "transition-colors",
        !isPending && !isTwoFactorEnabled && "border-destructive/40",
      )}
    >
      <CardHeader>
        <CardTitle className="text-lg">
          {t("Two-Factor Authentication")}
        </CardTitle>
        <CardDescription>
          {t("Protects your account by requiring a second factor at sign-in.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AnimatedSizeContainer height>
          {!isPending && !isTwoFactorEnabled && (
            <div className="pb-4">
              <Alert variant="destructive" className="text-destructive">
                <LucideAlertOctagon />
                <AlertDescription className="text-destructive">
                  {t(
                    "It is strongly recommended to enable two-factor authentication.",
                  )}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </AnimatedSizeContainer>
        <div>
          <ItemRow
            icon={<LucideQrCode className="size-6 shrink-0" />}
            rightSide={
              isPending ? (
                <Skeleton className="size-9 w-24 shrink-0" />
              ) : (
                <TwoFactorManageButton
                  terminology={isTwoFactorEnabled ? "replace" : "set-up"}
                  onConfirmed={() => setWasTwoFactorEnabled(true)}
                />
              )
            }
          >
            <p className="font-medium text-sm">
              {t("Authenticator App (TOTP)")}
            </p>
            {isPending ? (
              <Skeleton className="h-4 w-40" />
            ) : (
              <p className="text-muted-foreground text-sm leading-none">
                {isTwoFactorEnabled
                  ? t("Enrolled")
                  : t(
                      "Use an app like 1Password, Google Authenticator, or Microsoft Authenticator.",
                    )}
              </p>
            )}
          </ItemRow>
          {isTwoFactorEnabled && (
            <ItemRow
              icon={<LucideBinary className="size-6 shrink-0" />}
              rightSide={<RegenerateBackupCodesButton />}
            >
              <p className="font-medium text-sm">{t("Recovery Codes")}</p>
              <p className="text-muted-foreground text-sm leading-none">
                {t(
                  "Single-use codes in case you lose access to your other factors.",
                )}
              </p>
            </ItemRow>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
