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

import { Badge } from "@virtbase/ui/badge";
import { Button } from "@virtbase/ui/button";
import { Field, FieldLabel } from "@virtbase/ui/field";
import { Input } from "@virtbase/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@virtbase/ui/select";
import { Skeleton } from "@virtbase/ui/skeleton";
import { Switch } from "@virtbase/ui/switch";
import { Textarea } from "@virtbase/ui/textarea";
import { matchesTargets } from "@virtbase/utils";
import type { UpdateCloudInitSnippetInput } from "@virtbase/validators/admin";
import {
  SNIPPET_KINDS,
  TEMPLATE_ARCHITECTURES,
  TEMPLATE_INIT_SYSTEMS,
  TEMPLATE_OS_FAMILIES,
  TEMPLATE_PACKAGE_MANAGERS,
} from "@virtbase/validators/admin";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { updateSnippetAction } from "../../api/cloud-init-snippets/mutate-snippet";
import { SettingsCard } from "../proxmox-templates/cards/settings-card";

// CodeMirror is ~200 KB gzipped and is wanted on exactly this route, so it is
// loaded on demand rather than bundled into every admin page.
const SnippetEditor = dynamic(() => import("./snippet-editor"), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full" />,
});

/** The template metadata a selector is matched against, for the live preview. */
export interface SnippetTemplate {
  id: string;
  name: string;
  osFamily: string | null;
  osVersion: string | null;
  packageManager: string | null;
  initSystem: string | null;
  architecture: string | null;
}

const TARGET_DIMENSIONS = [
  ["osFamily", TEMPLATE_OS_FAMILIES],
  ["packageManager", TEMPLATE_PACKAGE_MANAGERS],
  ["initSystem", TEMPLATE_INIT_SYSTEMS],
  ["architecture", TEMPLATE_ARCHITECTURES],
] as const;

type TargetDimension = (typeof TARGET_DIMENSIONS)[number][0];

interface SnippetSettingsProps {
  snippet: UpdateCloudInitSnippetInput;
  templates: SnippetTemplate[];
}

export function SnippetSettings({ snippet, templates }: SnippetSettingsProps) {
  const t = useExtracted();
  const router = useRouter();

  const [draft, setDraft] = useState(snippet);

  const { execute, isPending } = useAction(updateSnippetAction, {
    onSuccess: () => {
      toast.success(t("Snippet saved"));
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError),
  });

  const set = <K extends keyof UpdateCloudInitSnippetInput>(
    key: K,
    value: UpdateCloudInitSnippetInput[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const save = () => execute(draft);

  const dimensionLabels: Record<TargetDimension, string> = {
    osFamily: t("OS family"),
    packageManager: t("Package manager"),
    initSystem: t("Init system"),
    architecture: t("Architecture"),
  };

  // Recomputed as the selector is edited, so the effect of a change is visible
  // before saving rather than at the next provisioning run.
  const matched = useMemo(
    () =>
      new Set(
        templates
          .filter((template) => matchesTargets(draft.targets, template))
          .map((template) => template.id),
      ),
    [draft.targets, templates],
  );

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        id="snippet-content"
        title={t("Content")}
        description={
          draft.kind === "shell"
            ? t("A script, written to the guest and run once on first boot.")
            : t(
                "A cloud-config fragment. Lists like runcmd and packages accumulate across snippets.",
              )
        }
        hint={t("Saving is blocked while the document does not parse.")}
        isPending={isPending}
        onSubmit={save}
      >
        <SnippetEditor
          value={draft.content}
          onChange={(value) => set("content", value)}
          kind={draft.kind}
        />
      </SettingsCard>

      <SettingsCard
        id="snippet-details"
        title={t("Details")}
        description={t("How this snippet is identified and ordered.")}
        hint={t("Lower priorities are composed first; ties break by slug.")}
        isPending={isPending}
        disabled={!draft.name || !draft.slug}
        onSubmit={save}
      >
        <div className="flex max-w-md flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="snippet-name">{t("Name")}</FieldLabel>
            <Input
              id="snippet-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={128}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="snippet-slug">{t("Slug")}</FieldLabel>
            <Input
              id="snippet-slug"
              value={draft.slug}
              onChange={(e) => set("slug", e.target.value)}
              maxLength={64}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="snippet-description">
              {t("Description")}
            </FieldLabel>
            <Textarea
              id="snippet-description"
              rows={2}
              value={draft.description ?? ""}
              onChange={(e) => set("description", e.target.value || null)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="snippet-kind">{t("Kind")}</FieldLabel>
              <Select
                value={draft.kind}
                onValueChange={(value) =>
                  set("kind", value as UpdateCloudInitSnippetInput["kind"])
                }
              >
                <SelectTrigger id="snippet-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SNIPPET_KINDS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="snippet-priority">
                {t("Priority")}
              </FieldLabel>
              <Input
                id="snippet-priority"
                type="number"
                value={draft.priority}
                onChange={(e) => set("priority", Number(e.target.value))}
              />
            </Field>
          </div>

          <Field orientation="horizontal">
            <Switch
              id="snippet-enabled"
              checked={draft.enabled}
              onCheckedChange={(value) => set("enabled", value)}
            />
            <FieldLabel htmlFor="snippet-enabled">{t("Enabled")}</FieldLabel>
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        id="snippet-targets"
        title={t("Applies to")}
        description={t(
          "Which templates receive this snippet. Every dimension you set has to match.",
        )}
        hint={t("Leave everything unselected to apply to all templates.")}
        isPending={isPending}
        onSubmit={save}
      >
        <div className="flex flex-col gap-4">
          {TARGET_DIMENSIONS.map(([key, options]) => {
            const selected = (draft.targets?.[key] ?? []) as string[];

            return (
              <Field key={key}>
                <FieldLabel>{dimensionLabels[key]}</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {options.map((option) => {
                    const active = selected.includes(option);

                    return (
                      <Button
                        key={option}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() =>
                          set("targets", {
                            ...draft.targets,
                            [key]: active
                              ? selected.filter((v) => v !== option)
                              : [...selected, option],
                          } as UpdateCloudInitSnippetInput["targets"])
                        }
                      >
                        {option}
                      </Button>
                    );
                  })}
                </div>
              </Field>
            );
          })}

          <Field className="max-w-xs">
            <FieldLabel htmlFor="snippet-os-version-range">
              {t("Version range")}
            </FieldLabel>
            <Input
              id="snippet-os-version-range"
              placeholder=">=12"
              value={draft.targets?.osVersionRange ?? ""}
              onChange={(e) =>
                set("targets", {
                  ...draft.targets,
                  osVersionRange: e.target.value || undefined,
                } as UpdateCloudInitSnippetInput["targets"])
              }
            />
          </Field>

          <Field>
            <FieldLabel>
              {t("Matches {count} of {total} templates", {
                count: String(matched.size),
                total: String(templates.length),
              })}
            </FieldLabel>
            {templates.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("No templates are defined yet.")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {templates.map((template) => (
                  <Badge
                    key={template.id}
                    variant={matched.has(template.id) ? "default" : "outline"}
                    className={
                      matched.has(template.id) ? undefined : "opacity-50"
                    }
                  >
                    {template.name}
                  </Badge>
                ))}
              </div>
            )}
          </Field>
        </div>
      </SettingsCard>
    </div>
  );
}
