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
import { Button } from "@virtbase/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@virtbase/ui/field";
import {
  LucideLock,
  LucideLockOpen,
  LucidePauseCircle,
  LucidePlayCircle,
  LucidePowerOff,
} from "@virtbase/ui/icons";
import { Input } from "@virtbase/ui/input";
import { RadioGroup, RadioGroupItem } from "@virtbase/ui/radio-group";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { Switch } from "@virtbase/ui/switch";
import type { CreateServerBackupInput } from "@virtbase/validators/server";
import { CreateServerBackupInputSchema } from "@virtbase/validators/server";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { startTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useCreateBackup } from "../../hooks/backups/use-create-backup";

export default function CreateBackupDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  >,
) {
  const t = useExtracted();

  const { id: serverId } = useParams<{ id: string }>();

  const defaultName = `Backup ${new Date().toLocaleString()}`;

  const form = useForm<CreateServerBackupInput>({
    resolver: zodResolver(CreateServerBackupInputSchema),
    defaultValues: {
      server_id: serverId,
      name: defaultName,
      is_locked: false,
      mode: "snapshot",
    },
  });

  const { mutateAsync, isPending } = useCreateBackup({
    mutationConfig: {
      onSuccess: () =>
        startTransition(() => {
          props.onOpenChange?.(false);
          form.reset();
        }),
      onError: (error) => {
        toast.error(error.message);
      },
    },
  });

  return (
    <ResponsiveDialog
      title={t("Create Backup")}
      description={t("Create a new backup for your server.")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={form.formState.isSubmitting || isPending}
            onClick={() => props.onOpenChange?.(false)}
          >
            {t("Abbrechen")}
          </Button>
          <Button
            type="submit"
            form="create-backup-form"
            disabled={form.formState.isSubmitting || isPending}
          >
            {isPending && <Spinner />}
            {t("Create Backup")}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="create-backup-form"
        onSubmit={form.handleSubmit((data) => mutateAsync(data))}
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
                  placeholder={defaultName}
                  type="text"
                  maxLength={64}
                  minLength={1}
                  {...field}
                />
              </Field>
            )}
          />
          <Controller
            name="mode"
            control={form.control}
            render={({ field, fieldState }) => (
              <FieldGroup data-invalid={fieldState.invalid}>
                <FieldSet>
                  <FieldLabel>{t("Backup Mode")}</FieldLabel>
                </FieldSet>
                <RadioGroup
                  defaultValue="snapshot"
                  name={field.name}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <FieldLabel htmlFor="mode-snapshot">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>
                          <LucidePlayCircle
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          {t("Snapshot")}
                        </FieldTitle>
                        <FieldDescription>
                          {t(
                            "Creates a backup without interrupting the system. The current state of the processes is backed up.",
                          )}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value="snapshot" id="mode-snapshot" />
                    </Field>
                  </FieldLabel>
                  <FieldLabel htmlFor="mode-suspend">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>
                          <LucidePauseCircle
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          {t("Suspend")}
                        </FieldTitle>
                        <FieldDescription>
                          {t(
                            "Interrupts the system briefly to create a backup without shutting it down.",
                          )}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value="suspend" id="mode-suspend" />
                    </Field>
                  </FieldLabel>
                  <FieldLabel htmlFor="mode-stop">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>
                          <LucidePowerOff
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          {t("Stop")}
                        </FieldTitle>
                        <FieldDescription>
                          {t(
                            "Completely shuts down the system before creating the backup.",
                          )}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value="stop" id="mode-stop" />
                    </Field>
                  </FieldLabel>
                </RadioGroup>
              </FieldGroup>
            )}
          />
          <Controller
            name="is_locked"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                <FieldContent>
                  <div className="flex items-center gap-2 transition-colors [&_svg]:size-4 [&_svg]:shrink-0">
                    <FieldLabel htmlFor={field.name}>
                      {t("Enable deletion protection")}
                    </FieldLabel>
                    {field.value ? (
                      <LucideLock className="text-green-500" />
                    ) : (
                      <LucideLockOpen className="text-destructive" />
                    )}
                  </div>
                  <FieldDescription>
                    {t(
                      "The newly created backup can only be deleted after the deletion protection is disabled.",
                    )}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id={field.name}
                  name={field.name}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-invalid={fieldState.invalid}
                />
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
