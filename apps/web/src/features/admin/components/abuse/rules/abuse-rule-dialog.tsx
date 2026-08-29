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

import type { DryRunResult } from "@virtbase/api/abuse";
import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { Badge } from "@virtbase/ui/badge";
import { Button } from "@virtbase/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@virtbase/ui/field";
import { LucideFlaskConical, LucideOctagonAlert } from "@virtbase/ui/icons";
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
import { AbuseRuleInputSchema } from "@virtbase/validators";
import { useExtracted, useFormatter } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import {
  CATEGORY_ICONS,
  ENFORCEMENT_ICONS,
  humanise,
  SEVERITY_ICONS,
} from "@/ui/abuse/case-meta";
import type { AbuseRuleListItem } from "../../../api/abuse/get-abuse-rules";
import {
  createAbuseRuleAction,
  dryRunAbuseRuleAction,
  updateAbuseRuleAction,
} from "../../../api/abuse/manage-abuse-rules";
import {
  CASE_CATEGORIES,
  CASE_SEVERITIES,
} from "../../../lib/abuse/validations";

/** A `Select` cannot hold an empty value, and "no condition" needs one. */
const ANY = "__any__";

const SIGNAL_SEVERITIES = ["info", "warning", "critical"] as const;

/** `terminate` is deliberately absent - deleting a server is operator-only. */
const RULE_ENFORCEMENT = ["none", "throttle", "isolate", "power_off"] as const;

/** Labels are entered `key=value` per line, which is how they read in a query. */
const parseLabels = (value: string): Record<string, string> | null => {
  const labels: Record<string, string> = {};

  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const at = trimmed.indexOf("=");
    if (at < 1) return null;

    labels[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
  }

  return labels;
};

const formatLabels = (labels: unknown): string =>
  Object.entries((labels ?? {}) as Record<string, unknown>)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n");

/** Blank means "no condition"; `0` is a condition and has to survive. */
const parseOptionalInt = (value: string): number | null =>
  "" === value.trim() ? null : Number.parseInt(value, 10);

function DryRunReport({ result }: { result: DryRunResult }) {
  const t = useExtracted();
  const format = useFormatter();

  if (0 === result.considered) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("No past signals to replay yet.")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {t(
          "Matches {matched} of the last {considered} signals, and decides {wins}.",
          {
            matched: format.number(result.matched),
            considered: format.number(result.considered),
            wins: format.number(result.wins),
          },
        )}
      </p>

      {result.enforcing > 0 ? (
        <Alert variant="warning">
          <LucideOctagonAlert aria-hidden="true" />
          <AlertTitle>
            {t(
              "{count, plural, one {# server would have been locked} other {# servers would have been locked}}",
              { count: result.enforcing },
            )}
          </AlertTitle>
          <AlertDescription>
            {t("Without an operator reading the report first.")}
          </AlertDescription>
        </Alert>
      ) : null}

      {result.shadowedBy.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">
            {t("Taken first by a higher-priority rule:")}
          </p>
          {result.shadowedBy.map((shadow) => (
            <p key={shadow.ruleId} className="truncate text-sm">
              {t("{name} (priority {priority}) · {count}", {
                name: shadow.name,
                priority: String(shadow.priority),
                count: format.number(shadow.count),
              })}
            </p>
          ))}
        </div>
      ) : null}

      {result.samples.length > 0 ? (
        <div className="flex flex-col divide-y rounded-md border">
          {result.samples.map((sample) => (
            <div key={sample.signalId} className="flex flex-col gap-1 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm">{sample.title}</p>
                {sample.staleAttribution ? (
                  <Badge variant="outline">{t("Stale")}</Badge>
                ) : null}
              </div>
              <p className="truncate text-muted-foreground text-xs">
                {t("{source} · {type} · {when}", {
                  source: sample.source,
                  type: sample.type,
                  when: format.relativeTime(sample.occurredAt),
                })}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {result.stale > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t(
            "{count, plural, one {# match had stale attribution and would not enforce} other {# matches had stale attribution and would not enforce}}.",
            { count: result.stale },
          )}
        </p>
      ) : null}
    </div>
  );
}

export function AbuseRuleDialog({
  rule,
  knownSources,
  open,
  onOpenChange,
}: {
  /** Absent when creating. */
  rule?: AbuseRuleListItem;
  knownSources: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useExtracted();
  const isEdit = Boolean(rule);

  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [priority, setPriority] = useState(String(rule?.priority ?? 100));

  const [matchType, setMatchType] = useState(rule?.matchType ?? "abuse.*");
  const [matchSource, setMatchSource] = useState(rule?.matchSource ?? ANY);
  const [matchSeverityMin, setMatchSeverityMin] = useState<string>(
    rule?.matchSeverityMin ?? ANY,
  );
  const [matchConfidenceMin, setMatchConfidenceMin] = useState(
    null === rule?.matchConfidenceMin || undefined === rule?.matchConfidenceMin
      ? ""
      : String(rule.matchConfidenceMin),
  );
  const [matchRepeatCountMin, setMatchRepeatCountMin] = useState(
    null === rule?.matchRepeatCountMin ||
      undefined === rule?.matchRepeatCountMin
      ? ""
      : String(rule.matchRepeatCountMin),
  );
  const [labelsText, setLabelsText] = useState(formatLabels(rule?.matchLabels));

  const [trustedSource, setTrustedSource] = useState(
    rule?.trustedSource ?? false,
  );
  const [actionCategory, setActionCategory] = useState<string>(
    rule?.actionCategory ?? ANY,
  );
  const [actionCaseSeverity, setActionCaseSeverity] = useState<string>(
    rule?.actionCaseSeverity ?? ANY,
  );
  const [actionEnforcement, setActionEnforcement] = useState<string>(
    rule?.actionEnforcement ?? "none",
  );
  const [actionGraceMinutes, setActionGraceMinutes] = useState(
    String(rule?.actionGraceMinutes ?? 0),
  );
  const [actionBlockOrders, setActionBlockOrders] = useState(
    rule?.actionBlockOrders ?? false,
  );
  const [actionNotifyUser, setActionNotifyUser] = useState(
    rule?.actionNotifyUser ?? true,
  );
  const [actionResponseHours, setActionResponseHours] = useState(
    String(rule?.actionResponseHours ?? 24),
  );

  const [error, setError] = useState<string | null>(null);
  const [labelsError, setLabelsError] = useState<string | null>(null);

  const onError = ({ error: failure }: { error: { serverError?: string } }) =>
    toast.error(failure.serverError ?? t("Something went wrong."));

  // No success toast: the dialog closes and the row appears or changes.
  const close = () => onOpenChange(false);

  const create = useAction(createAbuseRuleAction, {
    onSuccess: close,
    onError,
  });
  const update = useAction(updateAbuseRuleAction, {
    onSuccess: close,
    onError,
  });
  const dryRun = useAction(dryRunAbuseRuleAction, { onError });

  const isSaving = create.isPending || update.isPending;

  /**
   * The form as the schema sees it, or null with the reason on screen.
   *
   * One function for both saving and the dry run, so the rule an operator
   * tests is the rule they save - a dry run against a different reading of the
   * form would be worse than no dry run at all.
   */
  const collect = () => {
    const labels = parseLabels(labelsText);
    if (!labels) {
      setLabelsError(t("One `key=value` per line."));
      return null;
    }
    setLabelsError(null);

    const candidate = {
      name,
      description: description.trim() || null,
      enabled,
      priority: Number.parseInt(priority, 10),
      matchType,
      matchSource: ANY === matchSource ? null : matchSource,
      matchSeverityMin: ANY === matchSeverityMin ? null : matchSeverityMin,
      matchConfidenceMin: parseOptionalInt(matchConfidenceMin),
      matchLabels: labels,
      matchRepeatCountMin: parseOptionalInt(matchRepeatCountMin),
      trustedSource,
      actionCategory: ANY === actionCategory ? null : actionCategory,
      actionCaseSeverity:
        ANY === actionCaseSeverity ? null : actionCaseSeverity,
      actionEnforcement,
      actionGraceMinutes: Number.parseInt(actionGraceMinutes, 10),
      actionBlockOrders,
      actionNotifyUser,
      actionResponseHours: Number.parseInt(actionResponseHours, 10),
    };

    const parsed = AbuseRuleInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Something went wrong."));
      return null;
    }

    setError(null);
    return parsed.data;
  };

  const submit = () => {
    const values = collect();
    if (!values) return;

    if (rule) update.execute({ ...values, id: rule.id });
    else create.execute(values);
  };

  const test = () => {
    const values = collect();
    if (!values) return;

    dryRun.execute({ ...values, id: rule?.id ?? null });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t("Edit rule") : t("Add rule")}
      description={t("What a matching signal causes.")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={close}>
            {t("Cancel")}
          </Button>
          <Button type="button" disabled={isSaving} onClick={submit}>
            {isSaving && <Spinner />} {isEdit ? t("Save") : t("Add rule")}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="rule-name">{t("Name")}</FieldLabel>
          <Input
            id="rule-name"
            value={name}
            autoComplete="off"
            placeholder={t("Outbound spam, confirmed")}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="rule-description">{t("Description")}</FieldLabel>
          <Textarea
            id="rule-description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <FieldDescription>
            {t("Why this rule exists, for whoever finds it next.")}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="rule-priority">{t("Priority")}</FieldLabel>
          <Input
            id="rule-priority"
            type="number"
            min={0}
            max={10000}
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          />
          <FieldDescription>
            {t("Lower runs first. Only the first matching rule decides.")}
          </FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <FieldLabel htmlFor="rule-enabled">{t("Enabled")}</FieldLabel>
          <Switch
            id="rule-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </Field>

        <FieldSeparator />

        <FieldSet>
          <FieldLegend>{t("Matches")}</FieldLegend>
          <FieldDescription>
            {t("Every condition has to hold. A blank one is not a condition.")}
          </FieldDescription>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rule-type">{t("Signal type")}</FieldLabel>
              <Input
                id="rule-type"
                value={matchType}
                autoComplete="off"
                className="font-mono text-sm"
                onChange={(event) => setMatchType(event.target.value)}
              />
              <FieldDescription>
                {t("`abuse.*` matches a namespace, `abuse.ddos` one type.")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-source">{t("Source")}</FieldLabel>
              <Select value={matchSource} onValueChange={setMatchSource}>
                <SelectTrigger id="rule-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{t("Any source")}</SelectItem>
                  {knownSources.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {t("Sources that have sent something so far.")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-severity-min">
                {t("Minimum severity")}
              </FieldLabel>
              <Select
                value={matchSeverityMin}
                onValueChange={setMatchSeverityMin}
              >
                <SelectTrigger id="rule-severity-min">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{t("Any severity")}</SelectItem>
                  {SIGNAL_SEVERITIES.map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {severity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-confidence">
                {t("Minimum confidence")}
              </FieldLabel>
              <Input
                id="rule-confidence"
                type="number"
                min={0}
                max={100}
                value={matchConfidenceMin}
                placeholder={t("Any")}
                onChange={(event) => setMatchConfidenceMin(event.target.value)}
              />
              <FieldDescription>
                {t(
                  "A signal from a source that expresses none never meets this.",
                )}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-repeat">
                {t("Minimum prior cases")}
              </FieldLabel>
              <Input
                id="rule-repeat"
                type="number"
                min={0}
                max={1000}
                value={matchRepeatCountMin}
                placeholder={t("Any")}
                onChange={(event) => setMatchRepeatCountMin(event.target.value)}
              />
              <FieldDescription>
                {t("Cases this customer has settled in the last 90 days.")}
              </FieldDescription>
            </Field>

            <Field data-invalid={Boolean(labelsError)}>
              <FieldLabel htmlFor="rule-labels">{t("Labels")}</FieldLabel>
              <Textarea
                id="rule-labels"
                rows={3}
                value={labelsText}
                aria-invalid={Boolean(labelsError)}
                className="font-mono text-sm"
                onChange={(event) => {
                  setLabelsText(event.target.value);
                  setLabelsError(null);
                }}
              />
              {labelsError ? (
                <FieldError>{labelsError}</FieldError>
              ) : (
                <FieldDescription>
                  {t("One `key=value` per line. All of them must be present.")}
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSeparator />

        <FieldSet>
          <FieldLegend>{t("Causes")}</FieldLegend>

          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="rule-trusted">
                  {t("Trusted source")}
                </FieldLabel>
                <FieldDescription>
                  {t(
                    "Acts without an operator. Leave off and every match waits in triage.",
                  )}
                </FieldDescription>
              </FieldContent>
              <Switch
                id="rule-trusted"
                checked={trustedSource}
                onCheckedChange={setTrustedSource}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-category">{t("Category")}</FieldLabel>
              <Select value={actionCategory} onValueChange={setActionCategory}>
                <SelectTrigger id="rule-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>
                    {t("From the signal type")}
                  </SelectItem>
                  {CASE_CATEGORIES.map((category) => {
                    const Icon = CATEGORY_ICONS[category];

                    return (
                      <SelectItem key={category} value={category}>
                        <Icon aria-hidden="true" />
                        {humanise(category)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-case-severity">
                {t("Case severity")}
              </FieldLabel>
              <Select
                value={actionCaseSeverity}
                onValueChange={setActionCaseSeverity}
              >
                <SelectTrigger id="rule-case-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>
                    {t("From the signal severity")}
                  </SelectItem>
                  {CASE_SEVERITIES.map((severity) => {
                    const Icon = SEVERITY_ICONS[severity];

                    return (
                      <SelectItem key={severity} value={severity}>
                        <Icon aria-hidden="true" />
                        {severity}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-enforcement">
                {t("Enforcement")}
              </FieldLabel>
              <Select
                value={actionEnforcement}
                onValueChange={setActionEnforcement}
              >
                <SelectTrigger id="rule-enforcement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_ENFORCEMENT.map((level) => {
                    const Icon = ENFORCEMENT_ICONS[level];

                    return (
                      <SelectItem key={level} value={level}>
                        <Icon aria-hidden="true" />
                        {humanise(level)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldDescription>
                {t(
                  "Deleting a server is never automatic; an operator does that on the case.",
                )}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-grace">
                {t("Grace window (minutes)")}
              </FieldLabel>
              <Input
                id="rule-grace"
                type="number"
                min={0}
                max={10080}
                value={actionGraceMinutes}
                onChange={(event) => setActionGraceMinutes(event.target.value)}
              />
              <FieldDescription>
                {t(
                  "A case settled inside the window is never enforced at all.",
                )}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-response">
                {t("Response deadline (hours)")}
              </FieldLabel>
              <Input
                id="rule-response"
                type="number"
                min={1}
                max={720}
                value={actionResponseHours}
                onChange={(event) => setActionResponseHours(event.target.value)}
              />
              <FieldDescription>
                {t("Silence past this tightens enforcement one level.")}
              </FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="rule-block-orders">
                  {t("Block new orders")}
                </FieldLabel>
                <FieldDescription>
                  {t("Until the case settles.")}
                </FieldDescription>
              </FieldContent>
              <Switch
                id="rule-block-orders"
                checked={actionBlockOrders}
                onCheckedChange={setActionBlockOrders}
              />
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="rule-notify">
                {t("Notify the customer")}
              </FieldLabel>
              <Switch
                id="rule-notify"
                checked={actionNotifyUser}
                onCheckedChange={setActionNotifyUser}
              />
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSeparator />

        <FieldSet>
          <FieldLegend>{t("Dry run")}</FieldLegend>
          <FieldDescription>
            {t(
              "Replays this rule against the signals already received. Changes nothing.",
            )}
          </FieldDescription>

          <Field>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={dryRun.isPending}
              onClick={test}
            >
              {dryRun.isPending ? <Spinner /> : <LucideFlaskConical />}
              {t("Run")}
            </Button>
            {dryRun.result?.data ? (
              <DryRunReport result={dryRun.result.data} />
            ) : null}
          </Field>
        </FieldSet>

        {error ? <FieldError>{error}</FieldError> : null}
      </FieldGroup>
    </ResponsiveDialog>
  );
}
