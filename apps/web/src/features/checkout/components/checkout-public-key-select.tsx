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
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@virtbase/ui/field";
import { LucideUserKey } from "@virtbase/ui/icons/index";
import { RadioGroup, RadioGroupItem } from "@virtbase/ui/radio-group";
import { Textarea } from "@virtbase/ui/textarea";
import type { OrderNewServerPlanInput } from "@virtbase/validators";
import { useExtracted } from "next-intl";
import React from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { GetSSHKeysListOutput } from "@/features/account/hooks/ssh-keys/ssh-keys-list";

interface CheckoutPublicKeySelectProps {
  form: UseFormReturn<OrderNewServerPlanInput>;
  values: GetSSHKeysListOutput["ssh_keys"];
}

export function CheckoutPublicKeySelect({
  form,
  values,
}: CheckoutPublicKeySelectProps) {
  const t = useExtracted();
  const value = form.watch("ssh_key_id");

  if (value && values.length > 0) {
    return (
      <React.Fragment key="existing-ssh-key">
        <Controller
          name="ssh_key_id"
          control={form.control}
          render={({ field, fieldState }) => (
            <FieldGroup data-invalid={fieldState.invalid}>
              <FieldSet>
                <FieldLabel>{t("Existing SSH key")}</FieldLabel>
              </FieldSet>
              <RadioGroup
                defaultValue={field.value ?? ""}
                name={field.name}
                value={field.value ?? ""}
                onValueChange={field.onChange}
              >
                {values.map((sshKey) => (
                  <FieldLabel htmlFor={sshKey.id} key={sshKey.id}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>
                          <LucideUserKey className="size-4 shrink-0 text-muted-foreground" />
                          {sshKey.name}
                        </FieldTitle>
                        <FieldDescription>
                          {sshKey.fingerprint}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={sshKey.id} id={sshKey.id} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldGroup>
          )}
        />
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2 font-semibold text-sm leading-snug underline decoration-dotted"
          onClick={() => {
            form.setValue("ssh_key_id", null);
          }}
        >
          {t("Add new SSH key")}
        </button>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment key="new-ssh-key">
      <Controller
        name="new_ssh_key"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <div className="flex flex-row items-center justify-between gap-2">
              <FieldLabel htmlFor={field.name}>
                {t("SSH key (optional)")}
              </FieldLabel>
              <span className="flex font-normal text-muted-foreground text-sm">
                <span className="flex w-5 justify-end">
                  {field.value?.length ?? 0}
                </span>
                <span>/8192</span>
              </span>
            </div>
            <Textarea
              id={field.name}
              aria-invalid={fieldState.invalid}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="ssh-rsa AAAAB3NzaC1yc2..."
              className="scrollbar-thin min-h-48 select-auto resize-none whitespace-pre-wrap break-all font-mono"
              minLength={1}
              maxLength={8192}
              {...field}
              onChange={(e) =>
                field.onChange(e.target.value.trim() || undefined)
              }
              value={field.value ?? ""}
            />
            <FieldDescription>
              {t(
                "The SSH key will be stored in the user account and can be reused for future orders.",
              )}
            </FieldDescription>
          </Field>
        )}
      />
      {values.length > 0 && (
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2 font-semibold text-sm leading-snug underline decoration-dotted"
          onClick={() => {
            form.setValue("new_ssh_key", null);
            form.setValue("ssh_key_id", values[0]?.id);
          }}
        >
          {t("Select existing SSH key")}
        </button>
      )}
    </React.Fragment>
  );
}
