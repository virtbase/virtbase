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
import { Checkbox } from "@virtbase/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@virtbase/ui/field";
import {
  LucideArrowLeftCircle,
  LucideArrowRightCircle,
} from "@virtbase/ui/icons/index";
import { Input } from "@virtbase/ui/input";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@virtbase/ui/select";
import { Spinner } from "@virtbase/ui/spinner";
import type {
  CreateServerFirewallRuleInput,
  UpdateServerFirewallRuleInput,
} from "@virtbase/validators/server";
import {
  CreateServerFirewallRuleInputSchema,
  UpdateServerFirewallRuleInputSchema,
} from "@virtbase/validators/server";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useCallback, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useCreateFirewallRule } from "../hooks/use-create-firewall-rule";
import { useUpdateFirewallRule } from "../hooks/use-update-firewall-rule";
import { getICMPTypes, isICMP, isProtocolWithPorts } from "../lib/utils";
import { FirewallActionSelect } from "./firewall-action-select";
import { FirewallProtocolSelect } from "./firewall-protocol-select";

interface FirewallRuleDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {
  mode: "create" | "update";
  defaultValues?: Omit<UpdateServerFirewallRuleInput, "server_id">;
}

export default function FirewallRuleDialog({
  mode,
  defaultValues,
  ...props
}: FirewallRuleDialogProps) {
  const t = useExtracted();

  const { id: serverId } = useParams<{ id: string }>();

  const { mutate: createRule, isPending: isCreatePending } =
    useCreateFirewallRule({
      mutationConfig: {
        onMutate: () => {
          props.onOpenChange?.(false);
        },
      },
    });

  const { mutate: updateRule, isPending: isUpdatePending } =
    useUpdateFirewallRule({
      mutationConfig: {
        onMutate: () => {
          props.onOpenChange?.(false);
        },
      },
    });

  const isPending = mode === "create" ? isCreatePending : isUpdatePending;

  const form = useForm<
    CreateServerFirewallRuleInput | UpdateServerFirewallRuleInput
  >({
    defaultValues: {
      pos: 0,
      enabled: false,
      direction: "in",
      action: "ACCEPT",
      server_id: serverId,
      ...defaultValues,
    },
    resolver: zodResolver(
      mode === "create"
        ? CreateServerFirewallRuleInputSchema
        : UpdateServerFirewallRuleInputSchema,
    ),
    disabled: isPending,
  });

  const handleSubmit = useCallback(
    (data: CreateServerFirewallRuleInput | UpdateServerFirewallRuleInput) => {
      return mode === "create"
        ? createRule(data as CreateServerFirewallRuleInput)
        : updateRule(data as UpdateServerFirewallRuleInput);
    },
    [mode],
  );

  const proto = form.watch("proto");
  const isPortsSupported = isProtocolWithPorts(proto);

  useEffect(() => {
    if (!isPortsSupported) {
      form.setValue("sport", undefined);
      form.setValue("dport", undefined);
    }
  }, [isPortsSupported, form]);

  useEffect(() => {
    if (!isICMP(proto)) {
      form.setValue("icmp_type", undefined);
    }
  }, [proto, form]);

  useEffect(() => {
    return () => {
      form.reset();
    };
  }, []);

  const action =
    mode === "create" ? t("Create Firewall Rule") : t("Update Firewall Rule");

  const description =
    mode === "create"
      ? t("Create a new firewall rule.")
      : t("Update an existing firewall rule.");

  return (
    <ResponsiveDialog
      title={action}
      description={description}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange?.(false)}
            disabled={isPending}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            form="firewall-rule-form"
            disabled={form.formState.disabled}
          >
            {isPending && <Spinner />} {action}
          </Button>
        </>
      }
      {...props}
    >
      <form id="firewall-rule-form" onSubmit={form.handleSubmit(handleSubmit)}>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Controller
              name="direction"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>{t("Direction")}</FieldLabel>
                  <Select
                    name={field.name}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <SelectTrigger
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue placeholder={t("Select direction")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">
                        <LucideArrowRightCircle aria-hidden="true" />
                        <span className="truncate">{t("Incoming")}</span>
                      </SelectItem>
                      <SelectItem value="out">
                        <LucideArrowLeftCircle aria-hidden="true" />
                        <span className="truncate">{t("Outgoing")}</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <Controller
              name="action"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>{t("Action")}</FieldLabel>
                  <FirewallActionSelect
                    name={field.name}
                    onValueChange={field.onChange}
                    value={field.value}
                    triggerProps={{
                      id: field.name,
                      "aria-invalid": fieldState.invalid,
                    }}
                  />
                </Field>
              )}
            />
          </div>

          <Controller
            name="proto"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Protocol")}</FieldLabel>
                {/** TODO: Fix issue where selecting "*" resets to the original protocol */}
                <FirewallProtocolSelect
                  value={field.value}
                  onValueChange={field.onChange}
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  disabled={field.disabled}
                />
              </Field>
            )}
          />
          {isICMP(proto) && (
            <Controller
              name="icmp_type"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>{t("ICMP type")}</FieldLabel>
                  <Select
                    name={field.name}
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                  >
                    <SelectTrigger
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getICMPTypes(proto).map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          )}
          {isPortsSupported && (
            <div className="grid gap-4 md:grid-cols-2">
              {["sport", "dport"].map((port) => (
                <Controller
                  key={port}
                  name={port as "sport" | "dport"}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>
                        {port === "sport"
                          ? t("Source port")
                          : t("Destination port")}
                      </FieldLabel>
                      <Input
                        id={field.name}
                        aria-invalid={fieldState.invalid}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        autoCapitalize="off"
                        placeholder="0-65535"
                        {...field}
                        onChange={(e) =>
                          field.onChange(e.target.value ?? undefined)
                        }
                        value={field.value ?? ""}
                      />
                    </Field>
                  )}
                />
              ))}
            </div>
          )}
          <Controller
            name="enabled"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                <Checkbox
                  id={field.name}
                  name={field.name}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-invalid={fieldState.invalid}
                />
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>{t("Enabled")}</FieldLabel>
                </FieldContent>
              </Field>
            )}
          />
          <FieldSeparator />
          <Controller
            name="comment"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex flex-row items-center justify-between gap-2">
                  <FieldLabel htmlFor={field.name}>{t("Comment")}</FieldLabel>
                  <span className="flex font-normal text-muted-foreground text-sm">
                    <span className="flex w-5 justify-end">
                      {field.value?.length ?? 0}
                    </span>
                    <span>/64</span>
                  </span>
                </div>
                <Input
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  maxLength={64}
                  {...field}
                  onChange={(e) => field.onChange(e.target.value ?? undefined)}
                  value={field.value ?? ""}
                />
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
