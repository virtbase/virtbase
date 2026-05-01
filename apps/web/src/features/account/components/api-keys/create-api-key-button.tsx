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

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { Button } from "@virtbase/ui/button";
import { ClientOnly } from "@virtbase/ui/client-only";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@virtbase/ui/field";
import { LucideAlertTriangle, LucideEdit, LucideEye } from "@virtbase/ui/icons";
import { Input } from "@virtbase/ui/input";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@virtbase/ui/toggle-group";
import type {
  APIKeyPermissions,
  CreateAPIKeyInput,
} from "@virtbase/validators";
import {
  API_KEY_PERMISSIONS,
  CreateAPIKeyInputSchema,
} from "@virtbase/validators";
import { useExtracted } from "next-intl";
import { cache, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { createApiKeyAction } from "../../api/create-api-key";

const usePermissionLocalizations = cache(() => {
  const t = useExtracted();

  return {
    servers: t("Servers"),
    backups: t("Backups"),
    firewall: t("Firewall"),
    console: t("Console"),
    rdns: t("rDNS"),
    ssh_keys: t("SSH keys"),
    invoices: t("Invoices"),
    iso: t("ISO"),
  } satisfies Record<keyof APIKeyPermissions, string>;
});

export function CreateApiKeyButton() {
  const t = useExtracted();
  const permissionLocalizations = usePermissionLocalizations();

  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  const form = useForm<CreateAPIKeyInput>({
    defaultValues: {
      name: "",
      permissions: {},
    },
    resolver: zodResolver(CreateAPIKeyInputSchema),
    disabled: !open,
  });

  const [isPending, startTransition] = useTransition();

  const createApiKey = async (data: CreateAPIKeyInput) => {
    startTransition(async () => {
      const key = await createApiKeyAction(data);

      setKey(key);
      form.reset();
    });
  };

  const action = t("Create API key");

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {action}
      </Button>
      <ResponsiveDialog
        title={action}
        description={action}
        open={open}
        onOpenChange={(open) => {
          setOpen(open);
          setKey(null);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setKey(null);
              }}
              disabled={isPending}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              form="create-api-key-form"
              disabled={isPending}
            >
              {isPending && <Spinner />} {action}
            </Button>
          </>
        }
        containerClassName="flex flex-col gap-6 max-lg:flex-col-reverse"
      >
        {key && (
          <ClientOnly>
            <Alert variant="destructive">
              <LucideAlertTriangle aria-hidden="true" />
              <AlertTitle>{t("API key created")}</AlertTitle>
              <AlertDescription>
                <p>
                  {t(
                    "This key will only be displayed once. Please save it securely, as it cannot be restored:",
                  )}
                </p>
                <code className="select-all break-all font-mono">{key}</code>
              </AlertDescription>
            </Alert>
          </ClientOnly>
        )}
        <form
          id="create-api-key-form"
          onSubmit={form.handleSubmit((data) => createApiKey(data))}
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>{t("Name")}</FieldLabel>
                  <Input
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    type="text"
                    maxLength={64}
                    minLength={1}
                    placeholder={t("My API key")}
                    {...field}
                  />
                </Field>
              )}
            />
            <FieldGroup>
              <FieldSet>
                <FieldLegend variant="label">{t("Permissions")}</FieldLegend>
                <FieldDescription>
                  {t(
                    "Depending on the permissions, the API key can perform certain actions.",
                  )}
                </FieldDescription>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {Object.entries(API_KEY_PERMISSIONS).map(([key, values]) => (
                    <Controller
                      key={key}
                      name={`permissions.${key as keyof APIKeyPermissions}`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor={field.name}>
                            {
                              permissionLocalizations[
                                key as keyof typeof permissionLocalizations
                              ]
                            }
                          </FieldLabel>
                          <ToggleGroup
                            id={field.name}
                            type="multiple"
                            {...field}
                            onValueChange={field.onChange}
                            value={field.value ?? []}
                            aria-invalid={fieldState.invalid}
                          >
                            {values.map((value) => (
                              <ToggleGroupItem
                                key={value}
                                value={value}
                                variant="outline"
                                className="[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground"
                              >
                                {value === "read" && (
                                  <>
                                    <LucideEye aria-hidden="true" />
                                    {t("Read")}
                                  </>
                                )}
                                {value === "write" && (
                                  <>
                                    <LucideEdit aria-hidden="true" />
                                    {t("Write")}
                                  </>
                                )}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </Field>
                      )}
                    />
                  ))}
                </div>
              </FieldSet>
            </FieldGroup>
          </FieldGroup>
        </form>
      </ResponsiveDialog>
    </>
  );
}
