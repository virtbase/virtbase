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

import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { Badge } from "@virtbase/ui/badge";
import { Button } from "@virtbase/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideBan,
  LucideOctagonAlert,
  LucideShieldCheck,
  LucideSlidersHorizontal,
} from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { Switch } from "@virtbase/ui/switch";
import { useExtracted, useFormatter } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { ItemRow } from "@/features/account/components/item-row";
import { ENFORCEMENT_ICONS, humanise } from "@/ui/abuse/case-meta";
import type { AbuseRuleListItem } from "../../../api/abuse/get-abuse-rules";
import {
  deleteAbuseRuleAction,
  setAbuseRuleEnabledAction,
} from "../../../api/abuse/manage-abuse-rules";
import { AbuseRuleDialog } from "./abuse-rule-dialog";

/**
 * The rule's conditions as one line.
 *
 * A component rather than a helper taking `t`, because the extractor only sees
 * literals at a `useExtracted()` call site and cannot follow a translator
 * passed as a parameter - the whole namespace would go missing from `en.po`.
 *
 * Built here rather than stored: the row is a summary an operator scans, and
 * the dialog is where the same facts are editable one by one. An unset column
 * is not a condition, so it contributes nothing.
 */
function Conditions({ rule }: { rule: AbuseRuleListItem }) {
  const t = useExtracted();

  const parts = [rule.matchType];

  if (rule.matchSource) parts.push(rule.matchSource);
  if (rule.matchSeverityMin) {
    parts.push(t("{severity} and above", { severity: rule.matchSeverityMin }));
  }
  if (null !== rule.matchConfidenceMin) {
    parts.push(
      t("{value}% confidence", { value: String(rule.matchConfidenceMin) }),
    );
  }
  if (null !== rule.matchRepeatCountMin) {
    parts.push(
      t("{count, plural, one {# prior case} other {# prior cases}}", {
        count: rule.matchRepeatCountMin,
      }),
    );
  }
  for (const [key, value] of Object.entries(
    (rule.matchLabels ?? {}) as Record<string, unknown>,
  )) {
    parts.push(`${key}=${String(value)}`);
  }

  return (
    <p className="truncate text-muted-foreground text-sm leading-none">
      {parts.join(" · ")}
    </p>
  );
}

function RuleItem({
  rule,
  knownSources,
}: {
  rule: AbuseRuleListItem;
  knownSources: string[];
}) {
  const t = useExtracted();
  const format = useFormatter();
  const [editing, setEditing] = useState(false);

  const onError = ({ error }: { error: { serverError?: string } }) =>
    toast.error(error.serverError ?? t("Something went wrong."));

  // No success toast on either: the switch moves and the row disappears.
  const toggle = useAction(setAbuseRuleEnabledAction, { onError });
  const remove = useAction(deleteAbuseRuleAction, { onError });

  const Enforcement = ENFORCEMENT_ICONS[rule.actionEnforcement];

  return (
    <>
      <ItemRow
        icon={<Enforcement className="size-5 shrink-0" aria-hidden="true" />}
        className={rule.enabled ? undefined : "opacity-60"}
        rightSide={
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <p className="whitespace-nowrap text-muted-foreground text-sm">
              {rule.lastMatchedAt
                ? t("{count} signals · last {when}", {
                    count: format.number(rule.matchCount),
                    when: format.relativeTime(rule.lastMatchedAt),
                  })
                : t("No signals yet")}
            </p>
            <Switch
              aria-label={t("Enabled")}
              checked={rule.enabled}
              disabled={toggle.isPending}
              onCheckedChange={(enabled) =>
                toggle.execute({ id: rule.id, enabled })
              }
            />
            <Button variant="outline" onClick={() => setEditing(true)}>
              {t("Edit")}
            </Button>
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => remove.execute({ id: rule.id })}
            >
              {remove.isPending ? <Spinner /> : t("Delete")}
            </Button>
          </div>
        }
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate font-medium text-sm">{rule.name}</p>
          <Badge variant="outline" className="tabular-nums">
            {t("Priority {value}", { value: String(rule.priority) })}
          </Badge>
          {rule.trustedSource ? (
            <Badge variant="outline">
              <LucideShieldCheck aria-hidden="true" />
              {t("Trusted")}
            </Badge>
          ) : null}
          {"none" === rule.actionEnforcement ? null : (
            <Badge variant="outline">
              <Enforcement aria-hidden="true" />
              {humanise(rule.actionEnforcement)}
            </Badge>
          )}
          {rule.actionBlockOrders ? (
            <Badge variant="outline">
              <LucideBan aria-hidden="true" />
              {t("Blocks orders")}
            </Badge>
          ) : null}
        </div>
        <Conditions rule={rule} />
      </ItemRow>

      {editing ? (
        <AbuseRuleDialog
          rule={rule}
          knownSources={knownSources}
          open={editing}
          onOpenChange={setEditing}
        />
      ) : null}
    </>
  );
}

export function AbuseRulesList({
  rules,
  knownSources,
  noTrustedRule,
}: {
  rules: AbuseRuleListItem[];
  knownSources: string[];
  noTrustedRule: boolean;
}) {
  const t = useExtracted();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* The one thing about this page that is not visible from the rows: a
          rule set with nothing trusted in it is a queue, not an abuse desk. */}
      {noTrustedRule ? (
        <Alert variant="warning">
          <LucideOctagonAlert aria-hidden="true" />
          <AlertTitle>{t("Nothing enforces automatically")}</AlertTitle>
          <AlertDescription>
            {t(
              "No enabled rule is marked as a trusted source, so every case waits in triage for an operator.",
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle className="text-lg">{t("Abuse rules")}</CardTitle>
          <CardDescription>
            {t(
              "What a signal causes. The first rule that matches, by priority, decides the case.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LucideSlidersHorizontal aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("No rules")}</EmptyTitle>
                <EmptyDescription>
                  {t("Every report lands in triage until a rule matches it.")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            rules.map((rule) => (
              <RuleItem key={rule.id} rule={rule} knownSources={knownSources} />
            ))
          )}
        </CardContent>
        <CardFooter className="border-t bg-background [.border-t]:p-6">
          <div className="flex w-full flex-col items-center justify-center gap-4 lg:flex-row lg:justify-between">
            <p className="text-center text-muted-foreground text-sm">
              {t(
                "Only a rule marked as a trusted source may act without an operator.",
              )}
            </p>
            <Button onClick={() => setCreating(true)}>{t("Add rule")}</Button>
          </div>
        </CardFooter>
      </Card>

      {creating ? (
        <AbuseRuleDialog
          knownSources={knownSources}
          open={creating}
          onOpenChange={setCreating}
        />
      ) : null}
    </div>
  );
}
