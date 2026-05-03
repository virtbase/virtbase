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

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@virtbase/ui/field";
import { LucideGauge, LucideTerminal } from "@virtbase/ui/icons";
import { RadioGroup, RadioGroupItem } from "@virtbase/ui/radio-group";
import { Skeleton } from "@virtbase/ui/skeleton";
import { isBusy, isOperational } from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { GenericError } from "@/ui/generic-error";
import { useAdvancedSettings } from "../../hooks/advanced/use-advanced-settings";
import { useUpdateAdvancedSettings } from "../../hooks/advanced/use-update-advanced-settings";
import { useServerStatus } from "../../hooks/use-server-status";

export function AdvancedBiosSelector() {
  const t = useExtracted();
  const params = useParams<{ id: string }>();

  const {
    data: { status } = {},
    isPending: isServerStatusPending,
    isError: isServerStatusError,
    refetch: refetchServerStatus,
  } = useServerStatus({
    server_id: params.id,
  });

  const {
    data: { settings } = {},
    isPending,
    isError,
    refetch,
  } = useAdvancedSettings({
    server_id: params.id,
  });

  const { mutate: updateAdvancedSettings, isPending: isUpdatePending } =
    useUpdateAdvancedSettings();

  if (isServerStatusError || isError) {
    return (
      <GenericError
        className="border"
        reset={isServerStatusError ? refetchServerStatus : refetch}
      />
    );
  }

  if (isServerStatusPending || isPending || !status || !settings) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <RadioGroup
      value={settings.bios ?? "legacy"}
      onValueChange={(value: "legacy" | "uefi") =>
        updateAdvancedSettings({
          server_id: params.id,
          bios: value,
        })
      }
      disabled={isUpdatePending || !isOperational(status) || isBusy(status)}
    >
      <FieldLabel htmlFor="bios-legacy">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>
              <LucideTerminal
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              {t("Legacy BIOS")}
            </FieldTitle>
            <FieldDescription>
              {t("Use the legacy BIOS for this server.")}
            </FieldDescription>
          </FieldContent>
          <RadioGroupItem id="bios-legacy" value="legacy" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="bios-uefi">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>
              <LucideGauge
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              {t("UEFI BIOS")}
            </FieldTitle>
            <FieldDescription>
              {t("Use the newer UEFI BIOS for this server.")}
            </FieldDescription>
          </FieldContent>
          <RadioGroupItem id="bios-uefi" value="uefi" />
        </Field>
      </FieldLabel>
    </RadioGroup>
  );
}
