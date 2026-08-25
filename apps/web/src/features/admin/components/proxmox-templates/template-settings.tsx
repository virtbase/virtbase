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

import { Field, FieldLabel } from "@virtbase/ui/field";
import { Input } from "@virtbase/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@virtbase/ui/select";
import { Switch } from "@virtbase/ui/switch";
import type { UpdateProxmoxTemplateInput } from "@virtbase/validators/admin";
import {
  CHECKSUM_ALGORITHMS,
  TEMPLATE_ARCHITECTURES,
  TEMPLATE_INIT_SYSTEMS,
  TEMPLATE_OS_FAMILIES,
  TEMPLATE_PACKAGE_MANAGERS,
} from "@virtbase/validators/admin";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";
import { updateProxmoxTemplateAction } from "../../api/proxmox-templates/create-proxmox-template";
import { SettingsCard } from "./cards/settings-card";

interface TemplateSettingsProps {
  template: UpdateProxmoxTemplateInput;
  groups: { id: string; name: string }[];
}

/**
 * The template's editable configuration, one concern per card.
 *
 * Each card saves the whole template with its own section replaced, so an
 * operator changing an image URL never has to think about the guest metadata
 * below it.
 */
export function TemplateSettings({ template, groups }: TemplateSettingsProps) {
  const t = useExtracted();
  const router = useRouter();

  const [draft, setDraft] = useState(template);

  const { execute, isPending } = useAction(updateProxmoxTemplateAction, {
    onSuccess: () => {
      toast.success(t("Template saved"));
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError),
  });

  const set = <K extends keyof UpdateProxmoxTemplateInput>(
    key: K,
    value: UpdateProxmoxTemplateInput[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const save = () => execute(draft);

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        id="template-details"
        title={t("Details")}
        description={t("How this operating system is presented to customers.")}
        hint={t(
          "Icons live under /assets/static/distros. A disabled template stays configured but is never offered.",
        )}
        isPending={isPending}
        disabled={!draft.name}
        onSubmit={save}
      >
        <div className="flex max-w-md flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="template-name">{t("Name")}</FieldLabel>
            <Input
              id="template-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={64}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="template-icon">{t("Icon")}</FieldLabel>
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <OperatingSystemIcon icon={draft.icon} />
              </InputGroupAddon>
              <InputGroupInput
                id="template-icon"
                type="url"
                value={draft.icon ?? ""}
                onChange={(e) => set("icon", e.target.value.trim() || null)}
                placeholder="/assets/static/distros/debian.svg"
              />
            </InputGroup>
          </Field>

          <Field>
            <FieldLabel htmlFor="template-group">{t("Group")}</FieldLabel>
            <Select
              value={draft.proxmox_template_group_id}
              onValueChange={(value) => set("proxmox_template_group_id", value)}
            >
              <SelectTrigger id="template-group" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="horizontal">
            <Switch
              id="template-enabled"
              checked={draft.enabled}
              onCheckedChange={(value) => set("enabled", value)}
            />
            <FieldLabel htmlFor="template-enabled">
              {t("Offer to customers")}
            </FieldLabel>
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        id="template-image"
        title={t("Image")}
        description={t(
          "The cloud image a guest's disk is built from. It is downloaded to each node and imported at provisioning time.",
        )}
        hint={t(
          "Leave the checksum empty for a URL the vendor repoints in place.",
        )}
        isPending={isPending}
        disabled={!draft.image_url}
        onSubmit={save}
      >
        <div className="flex max-w-2xl flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="template-image-url">{t("URL")}</FieldLabel>
            <Input
              id="template-image-url"
              type="url"
              value={draft.image_url}
              onChange={(e) => set("image_url", e.target.value)}
              placeholder="https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="template-checksum">
                {t("Checksum")}
              </FieldLabel>
              <Input
                id="template-checksum"
                value={draft.image_checksum ?? ""}
                onChange={(e) =>
                  set("image_checksum", e.target.value.trim() || null)
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="template-checksum-algorithm">
                {t("Algorithm")}
              </FieldLabel>
              <Select
                value={draft.image_checksum_algorithm ?? "none"}
                onValueChange={(value) =>
                  set(
                    "image_checksum_algorithm",
                    value === "none"
                      ? null
                      : (value as UpdateProxmoxTemplateInput["image_checksum_algorithm"]),
                  )
                }
              >
                <SelectTrigger
                  id="template-checksum-algorithm"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("None")}</SelectItem>
                  {CHECKSUM_ALGORITHMS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field className="max-w-xs">
            <FieldLabel htmlFor="template-refresh-days">
              {t("Re-download after")}
            </FieldLabel>
            <Input
              id="template-refresh-days"
              type="number"
              min={1}
              placeholder={t("Default")}
              value={draft.image_refresh_days ?? ""}
              onChange={(e) =>
                set(
                  "image_refresh_days",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        id="template-guest"
        title={t("Operating system")}
        description={t(
          "Describes the guest so the right cloud-init snippets are applied to it.",
        )}
        hint={t("Snippets target these values rather than the template name.")}
        isPending={isPending}
        onSubmit={save}
      >
        <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="template-os-family">{t("Family")}</FieldLabel>
            <Select
              value={draft.os_family ?? "none"}
              onValueChange={(value) =>
                set(
                  "os_family",
                  value === "none"
                    ? null
                    : (value as UpdateProxmoxTemplateInput["os_family"]),
                )
              }
            >
              <SelectTrigger id="template-os-family" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("Not set")}</SelectItem>
                {TEMPLATE_OS_FAMILIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="template-os-version">
              {t("Version")}
            </FieldLabel>
            <Input
              id="template-os-version"
              value={draft.os_version ?? ""}
              onChange={(e) => set("os_version", e.target.value.trim() || null)}
              placeholder="13"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="template-package-manager">
              {t("Package manager")}
            </FieldLabel>
            <Select
              value={draft.package_manager ?? "none"}
              onValueChange={(value) =>
                set(
                  "package_manager",
                  value === "none"
                    ? null
                    : (value as UpdateProxmoxTemplateInput["package_manager"]),
                )
              }
            >
              <SelectTrigger id="template-package-manager" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("Not set")}</SelectItem>
                {TEMPLATE_PACKAGE_MANAGERS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="template-init-system">
              {t("Init system")}
            </FieldLabel>
            <Select
              value={draft.init_system ?? "none"}
              onValueChange={(value) =>
                set(
                  "init_system",
                  value === "none"
                    ? null
                    : (value as UpdateProxmoxTemplateInput["init_system"]),
                )
              }
            >
              <SelectTrigger id="template-init-system" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("Not set")}</SelectItem>
                {TEMPLATE_INIT_SYSTEMS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        id="template-hardware"
        title={t("Virtual hardware")}
        description={t(
          "How the guest is created in Proxmox. The defaults suit every current image.",
        )}
        hint={t("Change these only for an image that will not boot otherwise.")}
        isPending={isPending}
        onSubmit={save}
      >
        <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="template-architecture">
              {t("Architecture")}
            </FieldLabel>
            <Select
              value={draft.architecture}
              onValueChange={(value) =>
                set(
                  "architecture",
                  value as UpdateProxmoxTemplateInput["architecture"],
                )
              }
            >
              <SelectTrigger id="template-architecture" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_ARCHITECTURES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {(
            [
              ["ostype", t("OS type"), "l26"],
              ["cpu_type", t("CPU type"), "host"],
              ["bios_type", t("BIOS"), "seabios"],
              ["machine", t("Machine"), "q35"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <Field key={key}>
              <FieldLabel htmlFor={`template-${key}`}>{label}</FieldLabel>
              <Input
                id={`template-${key}`}
                value={draft[key]}
                placeholder={placeholder}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}
