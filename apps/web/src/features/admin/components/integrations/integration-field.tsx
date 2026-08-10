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

import type { FieldDescriptor } from "@virtbase/integration-sdk";
import { Field, FieldDescription, FieldLabel } from "@virtbase/ui/field";
import { Input } from "@virtbase/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@virtbase/ui/select";
import { Switch } from "@virtbase/ui/switch";
import { Textarea } from "@virtbase/ui/textarea";
import { useExtracted } from "next-intl";

/**
 * Renders one field from an integration's descriptor.
 *
 * The whole point of the descriptor is that this component is the only form
 * code that ever needs writing: a new integration, or a new setting on an
 * existing one, is a declaration rather than a React change.
 */
export function IntegrationField({
  field,
  value,
  onChange,
  disabled,
  secretConfigured,
}: {
  field: FieldDescriptor;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** For secrets: a value is stored, but never sent to the browser. */
  secretConfigured?: boolean;
}) {
  const t = useExtracted();

  const id = `field-${field.key}`;
  const isSecret = field.widget === "password";

  return (
    <Field>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>

      {field.widget === "switch" ? (
        <Switch
          id={id}
          checked={value === "true"}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(String(checked))}
        />
      ) : field.widget === "select" ? (
        <Select value={value} disabled={disabled} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder={field.placeholder ?? t("Select…")} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.widget === "textarea" ? (
        <Textarea
          id={id}
          value={value}
          disabled={disabled}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={
            isSecret
              ? "password"
              : field.widget === "number"
                ? "number"
                : "text"
          }
          value={value}
          disabled={disabled}
          autoComplete="off"
          placeholder={
            // A stored secret is never sent to the browser, so the field shows
            // that one exists and stays empty until it is being replaced.
            isSecret && secretConfigured
              ? t("•••••••• (leave blank to keep)")
              : field.placeholder
          }
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {field.help ? <FieldDescription>{field.help}</FieldDescription> : null}
    </Field>
  );
}
