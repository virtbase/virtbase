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
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@virtbase/ui/field";
import {
  LucideCircleQuestionMark,
  LucideFileText,
  LucideHardDrive,
} from "@virtbase/ui/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@virtbase/ui/input-group";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@virtbase/ui/tooltip";
import type { CreateProxmoxNodeInput } from "@virtbase/validators/admin";
import { CreateProxmoxNodeInputSchema } from "@virtbase/validators/admin";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import type React from "react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { ShowPasswordAddon } from "@/ui/input-group-addons";
import { createProxmoxNodeAction } from "../../api/proxmox-nodes/create-proxmox-node";
import { transformTextField } from "../../lib/transform-text-field";

export function CreateNodeDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  >,
) {
  const t = useExtracted();

  const [isTokenSecretVisible, setIsTokenSecretVisible] = useState(false);

  const form = useForm<CreateProxmoxNodeInput>({
    defaultValues: {
      // TODO: Datacenter and Proxmox Node Group selector
      datacenter_id: "",
      proxmox_node_group_id: "",
      hostname: "",
      fqdn: "",
      token_id: "",
      token_secret: "",
      snippet_storage: "",
      backup_storage: "",
    },
    resolver: zodResolver(CreateProxmoxNodeInputSchema),
  });

  const { execute, isPending } = useAction(createProxmoxNodeAction, {
    onSuccess: () => {
      form.reset();
      props.onOpenChange?.(false);
    },
    onError: ({ error }) => {
      toast.error(error.serverError);
    },
  });

  return (
    <ResponsiveDialog
      title={t("Create Proxmox Node")}
      description={t("Create a new Proxmox VE node to host servers.")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange?.(false)}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            form="create-proxmox-node-form"
            disabled={isPending}
          >
            {isPending && <Spinner />} {t("Create Proxmox Node")}
          </Button>
        </>
      }
      {...props}
    >
      <form
        id="create-proxmox-node-form"
        onSubmit={form.handleSubmit((data) => execute(data))}
      >
        <FieldGroup>
          <Controller
            name="hostname"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Hostname")}</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    type="text"
                    placeholder="epyc01"
                    {...field}
                  />
                  <InputGroupAddon align="inline-end">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InputGroupButton
                            size="icon-xs"
                            className="rounded-full"
                          >
                            <LucideCircleQuestionMark />
                          </InputGroupButton>
                        </TooltipTrigger>
                        <TooltipContent
                          className="max-w-xs text-center"
                          align="end"
                        >
                          {t(
                            "The hostname of the Proxmox VE node as configured in the Proxmox cluster.",
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            )}
          />
          <Controller
            name="fqdn"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("FQDN")}</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    type="text"
                    placeholder="epyc01.example.com"
                    {...field}
                  />
                  <InputGroupAddon align="inline-end">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InputGroupButton
                            size="icon-xs"
                            className="rounded-full"
                          >
                            <LucideCircleQuestionMark />
                          </InputGroupButton>
                        </TooltipTrigger>
                        <TooltipContent
                          className="max-w-xs text-center"
                          align="end"
                        >
                          {t(
                            "The FQDN of the Proxmox VE node where the API is accessible. Must be reachable from the internet and use a valid TLS certificate.",
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            )}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Controller
              name="token_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>{t("Token ID")}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                      type="text"
                      placeholder="user@pam!tokenid"
                      {...field}
                    />
                  </InputGroup>
                </Field>
              )}
            />
            <Controller
              name="token_secret"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("Token Secret")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                      type={isTokenSecretVisible ? "text" : "password"}
                      placeholder="f7d63f02-eb..."
                      {...field}
                    />

                    <InputGroupAddon align="inline-end">
                      <ShowPasswordAddon
                        isPasswordVisible={isTokenSecretVisible}
                        setIsPasswordVisible={setIsTokenSecretVisible}
                      />
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Controller
              name="snippet_storage"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("Snippet Storage")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <LucideFileText />
                    </InputGroupAddon>
                    <InputGroupInput
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                      type="text"
                      minLength={1}
                      placeholder="cephfs"
                      {...field}
                    />
                    <InputGroupAddon align="inline-end">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InputGroupButton
                            size="icon-xs"
                            className="rounded-full"
                          >
                            <LucideCircleQuestionMark />
                          </InputGroupButton>
                        </TooltipTrigger>
                        <TooltipContent
                          className="max-w-xs text-center"
                          align="end"
                        >
                          {t(
                            "Cloud-init YAML files for any servers on this node will be stored here.",
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              )}
            />
            <Controller
              name="backup_storage"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("Backup Storage")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <LucideHardDrive />
                    </InputGroupAddon>
                    <InputGroupInput
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                      type="text"
                      minLength={1}
                      placeholder="cephfs"
                      {...field}
                    />
                    <InputGroupAddon align="inline-end">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InputGroupButton
                            size="icon-xs"
                            className="rounded-full"
                          >
                            <LucideCircleQuestionMark />
                          </InputGroupButton>
                        </TooltipTrigger>
                        <TooltipContent
                          className="max-w-xs text-center"
                          align="end"
                        >
                          {t(
                            "Backups of any servers on this node will be stored here.",
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              )}
            />
          </div>

          <Controller
            name="netrate"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Uplink")}</FieldLabel>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <InputGroupText>MB/s</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    type="text"
                    inputMode="numeric"
                    {...field}
                    value={transformTextField.input(field.value)}
                    onChange={(e) =>
                      field.onChange(transformTextField.output(e))
                    }
                  />
                  <InputGroupAddon align="inline-end">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InputGroupButton
                          size="icon-xs"
                          className="rounded-full"
                        >
                          <LucideCircleQuestionMark />
                        </InputGroupButton>
                      </TooltipTrigger>
                      <TooltipContent
                        className="max-w-xs text-center"
                        align="end"
                      >
                        {t(
                          "The maximum possible network bandwidth of the Uplink in MB/s.",
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            )}
          />
          <FieldSeparator />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Controller
              name="guest_limit"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("Maximum number of VMs")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <InputGroupText>{t("VMs")}</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                      type="text"
                      inputMode="numeric"
                      placeholder={t("Unlimited")}
                      {...field}
                      onChange={(e) =>
                        field.onChange(transformTextField.output(e))
                      }
                      value={transformTextField.input(field.value)}
                    />
                    <LimitHint />
                  </InputGroup>
                </Field>
              )}
            />
            <Controller
              name="memory_limit"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("Maximum memory")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <InputGroupText>MiB</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                      type="text"
                      inputMode="numeric"
                      placeholder={t("Unlimited")}
                      {...field}
                      onChange={(e) =>
                        field.onChange(transformTextField.output(e))
                      }
                      value={transformTextField.input(field.value)}
                    />
                    <LimitHint />
                  </InputGroup>
                </Field>
              )}
            />
            <Controller
              name="storage_limit"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("Maximum storage")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <InputGroupText>GiB</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                      type="text"
                      inputMode="numeric"
                      placeholder={t("Unlimited")}
                      {...field}
                      onChange={(e) =>
                        field.onChange(transformTextField.output(e))
                      }
                      value={transformTextField.input(field.value)}
                    />
                    <LimitHint />
                  </InputGroup>
                </Field>
              )}
            />
            <Controller
              name="cores_limit"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("Maximum vCores")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <InputGroupText>{t("vCores")}</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                      type="text"
                      inputMode="numeric"
                      placeholder={t("Unlimited")}
                      {...field}
                      onChange={(e) =>
                        field.onChange(transformTextField.output(e))
                      }
                      value={transformTextField.input(field.value)}
                    />
                    <LimitHint />
                  </InputGroup>
                </Field>
              )}
            />
          </div>
          <Controller
            name="netrate_limit"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>
                  {t("Network limit")}
                </FieldLabel>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <InputGroupText>MB/s</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    type="text"
                    inputMode="numeric"
                    placeholder={t("Unlimited")}
                    {...field}
                    onChange={(e) =>
                      field.onChange(transformTextField.output(e))
                    }
                    value={transformTextField.input(field.value)}
                  />

                  <LimitHint />
                </InputGroup>
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}

function LimitHint() {
  const t = useExtracted();

  return (
    <InputGroupAddon align="inline-end">
      <Tooltip>
        <TooltipTrigger asChild>
          <InputGroupButton size="icon-xs" className="rounded-full">
            <LucideCircleQuestionMark />
          </InputGroupButton>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-center" align="end">
          {t(
            "If reached, this node will no longer be used for services. Leave empty for unlimited.",
          )}
        </TooltipContent>
      </Tooltip>
    </InputGroupAddon>
  );
}
