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
import { RadioGroup, RadioGroupItem } from "@virtbase/ui/radio-group";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { GenericError } from "@/ui/generic-error";
import { useAdvancedSettings } from "../../hooks/advanced/use-advanced-settings";
import { useUpdateAdvancedSettings } from "../../hooks/advanced/use-update-advanced-settings";

export function AdvancedTpmSelector() {
  const t = useExtracted();
  const params = useParams<{ id: string }>();

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

  if (isError) {
    return <GenericError className="border" reset={refetch} />;
  }

  if (isPending || !settings) {
    return <Skeleton className="h-72 w-full" />;
  }

  return (
    <RadioGroup
      value={settings.tpm ?? "disabled"}
      onValueChange={(value: "v1.2" | "v2.0" | "disabled") =>
        updateAdvancedSettings({
          server_id: params.id,
          tpm: value === "disabled" ? null : value,
        })
      }
      disabled={isUpdatePending}
    >
      <FieldLabel htmlFor="tpm-disabled">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>{t("Disable TPM")}</FieldTitle>
            <FieldDescription>
              {t("Turn off TPM completely for this server.")}
            </FieldDescription>
          </FieldContent>
          <RadioGroupItem id="tpm-disabled" value="disabled" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="tpm-version-1">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>{t("Enable TPM v1.2")}</FieldTitle>
            <FieldDescription>
              {t("Activate TPM v1.2 for this server.")}
            </FieldDescription>
          </FieldContent>
          <RadioGroupItem id="tpm-version-1" value="v1.2" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="tpm-version-2">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>{t("Enable TPM v2.0")}</FieldTitle>
            <FieldDescription>
              {t("Activate TPM v2.0 for this server.")}
            </FieldDescription>
          </FieldContent>
          <RadioGroupItem id="tpm-version-2" value="v2.0" />
        </Field>
      </FieldLabel>
    </RadioGroup>
  );
}
