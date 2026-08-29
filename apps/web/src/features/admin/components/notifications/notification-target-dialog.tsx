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

import type { NotificationChannelDescription } from "@virtbase/api/notifications";
import { Button } from "@virtbase/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@virtbase/ui/field";
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
import { Switch } from "@virtbase/ui/switch";
import { Textarea } from "@virtbase/ui/textarea";
import { NotificationKeyGlobSchema } from "@virtbase/validators";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import type { NotificationTargetListItem } from "../../api/notifications/get-notification-settings";
import {
  createNotificationTargetAction,
  testNotificationTargetAction,
  updateNotificationTargetAction,
} from "../../api/notifications/manage-notification-targets";
import { IntegrationField } from "../integrations/integration-field";

const SEVERITIES = ["info", "warning", "critical"] as const;

/** Keys are entered one per line, which is how operators think about a list. */
const parseKeys = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export function NotificationTargetDialog({
  target,
  channels,
  open,
  onOpenChange,
}: {
  /** Absent when creating. */
  target?: NotificationTargetListItem;
  channels: NotificationChannelDescription[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useExtracted();
  const isEdit = Boolean(target);

  const [name, setName] = useState(target?.name ?? "");
  const [channelId, setChannelId] = useState(
    target?.channel ?? channels[0]?.id ?? "",
  );
  const [enabled, setEnabled] = useState(target?.enabled ?? true);
  const [minSeverity, setMinSeverity] = useState(target?.minSeverity ?? "info");
  const [keysText, setKeysText] = useState(
    (target?.matchKeys ?? ["*"]).join("\n"),
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(target?.config ?? {}).map(([key, value]) => [
        key,
        null === value || undefined === value ? "" : String(value),
      ]),
    ),
  );
  const [keysError, setKeysError] = useState<string | null>(null);

  const channel = channels.find((candidate) => candidate.id === channelId);
  const secretKeys = new Set(channel?.secretKeys ?? []);

  const onError = ({ error }: { error: { serverError?: string } }) =>
    toast.error(error.serverError ?? t("Something went wrong."));

  // No success toast: the dialog closes and the row appears or changes, which
  // says it better than a message that has to be read.
  const close = () => onOpenChange(false);

  const create = useAction(createNotificationTargetAction, {
    onSuccess: close,
    onError,
  });
  const update = useAction(updateNotificationTargetAction, {
    onSuccess: close,
    onError,
  });
  // The one action with no visible result, so the only one worth a message.
  const test = useAction(testNotificationTargetAction, {
    onSuccess: () => toast.success(t("Test notification delivered.")),
    onError,
  });

  const isSaving = create.isPending || update.isPending;

  const submit = () => {
    const matchKeys = parseKeys(keysText);

    if (matchKeys.length === 0) {
      setKeysError(t("Add at least one key, or `*` for everything."));
      return;
    }

    const invalid = matchKeys.find(
      (key) => !NotificationKeyGlobSchema.safeParse(key).success,
    );
    if (invalid) {
      setKeysError(t("`{key}` is not a valid key.", { key: invalid }));
      return;
    }

    setKeysError(null);

    const config: Record<string, string> = {};
    const secrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (secretKeys.has(key)) secrets[key] = value;
      else config[key] = value;
    }

    const payload = {
      name,
      channel: channelId,
      enabled,
      matchKeys,
      minSeverity,
      locale: null,
      config,
      secrets,
    };

    if (target) update.execute({ ...payload, id: target.id });
    else create.execute(payload);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t("Edit target") : t("Add target")}
      description={t("Where a notification goes, and which ones it receives.")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={close}>
            {t("Cancel")}
          </Button>
          <Button type="button" disabled={isSaving} onClick={submit}>
            {isSaving && <Spinner />} {isEdit ? t("Save") : t("Add target")}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="target-name">{t("Name")}</FieldLabel>
          <Input
            id="target-name"
            value={name}
            autoComplete="off"
            placeholder={t("Ops channel")}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="target-channel">{t("Channel")}</FieldLabel>
          <Select
            value={channelId}
            onValueChange={(value) => {
              setChannelId(value);
              // Field values belong to the channel that declared them; keeping
              // them across a switch would send a Discord URL to a webhook.
              setValues({});
            }}
          >
            <SelectTrigger id="target-channel">
              <SelectValue placeholder={t("Select a channel")} />
            </SelectTrigger>
            <SelectContent>
              {channels.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {(channel?.targetFields ?? []).map((field) => (
          <IntegrationField
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            disabled={isSaving}
            secretConfigured={
              secretKeys.has(field.key) &&
              Boolean(target?.configuredSecretKeys.includes(field.key))
            }
            onChange={(value) =>
              setValues((current) => ({ ...current, [field.key]: value }))
            }
          />
        ))}

        <Field data-invalid={Boolean(keysError)}>
          <FieldLabel htmlFor="target-keys">{t("Keys")}</FieldLabel>
          <Textarea
            id="target-keys"
            rows={4}
            value={keysText}
            aria-invalid={Boolean(keysError)}
            className="font-mono text-sm"
            onChange={(event) => {
              setKeysText(event.target.value);
              setKeysError(null);
            }}
          />
          {keysError ? (
            <FieldError>{keysError}</FieldError>
          ) : (
            <FieldDescription>
              {t(
                "One per line. `abuse.*` matches a namespace, `*` everything.",
              )}
            </FieldDescription>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="target-severity">
            {t("Minimum severity")}
          </FieldLabel>
          <Select
            value={minSeverity}
            onValueChange={(value) =>
              setMinSeverity(value as (typeof SEVERITIES)[number])
            }
          >
            <SelectTrigger id="target-severity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((severity) => (
                <SelectItem key={severity} value={severity}>
                  {severity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {t("Anything below this is not delivered.")}
          </FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <FieldLabel htmlFor="target-enabled">{t("Enabled")}</FieldLabel>
          <Switch
            id="target-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </Field>

        {target ? (
          <>
            <FieldSeparator />
            <Field orientation="horizontal">
              {/* FieldContent carries `flex-1`, which is what pushes the button
                  to the right edge - a bare div does not grow and leaves it
                  stranded mid-row. */}
              <FieldContent>
                <FieldLabel htmlFor="target-test">
                  {t("Test delivery")}
                </FieldLabel>
                <FieldDescription>
                  {t("Sends a real notification to this target.")}
                </FieldDescription>
              </FieldContent>
              <Button
                id="target-test"
                type="button"
                variant="outline"
                disabled={test.isPending || !target.channelAvailable}
                onClick={() =>
                  test.execute({ id: target.id, name: target.name })
                }
              >
                {test.isPending && <Spinner />} {t("Send test")}
              </Button>
            </Field>
          </>
        ) : null}
      </FieldGroup>
    </ResponsiveDialog>
  );
}
