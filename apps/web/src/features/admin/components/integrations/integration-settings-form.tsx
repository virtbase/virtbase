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
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { FieldGroup } from "@virtbase/ui/field";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import type { IntegrationListItem } from "../../api/integrations/get-integrations-list";
import {
  saveIntegrationSecretsAction,
  saveIntegrationSettingsAction,
} from "../../api/integrations/update-integration";
import { IntegrationField } from "./integration-field";

const toFormValues = (
  keys: string[],
  source: Record<string, unknown> = {},
): Record<string, string> =>
  Object.fromEntries(
    keys.map((key) => [
      key,
      source[key] === undefined || source[key] === null
        ? ""
        : String(source[key]),
    ]),
  );

export function IntegrationSettingsForm({
  item,
}: {
  item: IntegrationListItem;
}) {
  const { descriptor } = item;

  const t = useExtracted();

  const [settings, setSettings] = useState(() =>
    toFormValues(
      descriptor.settingsFields.map((field) => field.key),
      item.settings,
    ),
  );
  const [secrets, setSecrets] = useState(() =>
    toFormValues(descriptor.secretFields.map((field) => field.key)),
  );

  const onError = ({ error }: { error: { serverError?: string } }) =>
    toast.error(error.serverError ?? t("Something went wrong."));

  const saveSettings = useAction(saveIntegrationSettingsAction, {
    onError,
  });

  const saveSecrets = useAction(saveIntegrationSecretsAction, {
    onSuccess: () => {
      // Never keep a credential in component state once it has been stored.
      setSecrets(toFormValues(descriptor.secretFields.map((f) => f.key)));
    },
    onError,
  });

  return (
    <div className="flex flex-col gap-6">
      {descriptor.settingsFields.length > 0 ? (
        <Card className="overflow-hidden pb-0">
          <CardHeader>
            <CardTitle className="text-base">{t("Settings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {descriptor.settingsFields.map((field) => (
                <IntegrationField
                  key={field.key}
                  field={field}
                  value={settings[field.key] ?? ""}
                  disabled={saveSettings.isPending}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      [field.key]: value,
                    }))
                  }
                />
              ))}
            </FieldGroup>
          </CardContent>
          <CardFooter className="border-t bg-background [.border-t]:p-6">
            <div className="flex w-full flex-col items-center justify-end gap-4 lg:flex-row lg:justify-end">
              <Button
                size="sm"
                disabled={saveSettings.isPending}
                onClick={() =>
                  saveSettings.execute({
                    integrationId: descriptor.id,
                    settings,
                  })
                }
              >
                {saveSettings.isPending ? <Spinner /> : t("Save")}
              </Button>
            </div>
          </CardFooter>
        </Card>
      ) : null}

      {descriptor.secretFields.length > 0 ? (
        <Card className="overflow-hidden pb-0">
          <CardHeader>
            <CardTitle className="text-base">{t("Secrets")}</CardTitle>
            <CardDescription>
              {t(
                "Stored encrypted and never shown again. Leave a field blank to keep its current value.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {descriptor.secretFields.map((field) => (
                <IntegrationField
                  key={field.key}
                  field={field}
                  value={secrets[field.key] ?? ""}
                  disabled={saveSecrets.isPending}
                  secretConfigured={item.configuredSecretKeys.includes(
                    field.key,
                  )}
                  onChange={(value) =>
                    setSecrets((current) => ({
                      ...current,
                      [field.key]: value,
                    }))
                  }
                />
              ))}
            </FieldGroup>
          </CardContent>
          <CardFooter className="border-t bg-background [.border-t]:p-6">
            <div className="flex w-full flex-col items-center justify-end gap-4 lg:flex-row lg:justify-end">
              <Button
                size="sm"
                disabled={saveSecrets.isPending}
                onClick={() =>
                  saveSecrets.execute({ integrationId: descriptor.id, secrets })
                }
              >
                {saveSecrets.isPending ? <Spinner /> : t("Save")}
              </Button>
            </div>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  );
}
