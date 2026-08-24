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

import { cn } from "@virtbase/ui";
import { Button } from "@virtbase/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@virtbase/ui/card";
import { ClientOnly } from "@virtbase/ui/client-only";
import { LucideTrash2 } from "@virtbase/ui/icons/index";
import { Spinner } from "@virtbase/ui/spinner";
import dynamic from "next/dynamic";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { ItemRow } from "@/features/account/components/item-row";
import { useDeleteFirewallRule } from "../hooks/use-delete-firewall-rule";
import { useFindingMapping } from "../hooks/use-finding-mapping";
import type { FirewallFinding } from "../hooks/use-firewall-analysis";
import { useFirewallAnalysis } from "../hooks/use-firewall-analysis";

const FirewallRuleDialog = dynamic(() => import("./firewall-rule-dialog"), {
  ssr: false,
});

const SEVERITY_STYLES: Record<FirewallFinding["severity"], string> = {
  critical: "text-destructive",
  warning: "text-yellow-600",
  info: "text-muted-foreground",
};

/**
 * Lists what is worth fixing about a server's exposure.
 *
 * Renders nothing when there is nothing to say. A card that is always present -
 * and usually empty - teaches customers to scroll past it, which is exactly the
 * habit this feature cannot afford.
 *
 * `ANALYSIS_INCOMPLETE` is filtered out here even though the API returns it:
 * the reason the analysis could not run is already on screen, either as the
 * guest agent notice or as the in-VM firewall warning, and saying it a third
 * time would be noise.
 */
export function FirewallFindingsCard({ serverId }: { serverId: string }) {
  const t = useExtracted();
  const describe = useFindingMapping();

  const { data, isPending, isError } = useFirewallAnalysis({
    server_id: serverId,
  });

  const [suggested, setSuggested] = useState<FirewallFinding | null>(null);
  const { mutate: deleteRule, isPending: isDeletePending } =
    useDeleteFirewallRule();

  if (isPending || isError) {
    return null;
  }

  const findings = data.analysis.findings.filter(
    (finding) => finding.code !== "ANALYSIS_INCOMPLETE",
  );

  if (findings.length === 0) {
    return null;
  }

  return (
    <ClientOnly>
      <Card className="gap-0 overflow-hidden pb-0">
        <CardHeader className="pb-4">
          <CardTitle>{t("Recommendations")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {findings.map((finding, index) => {
            const { title, description, icon: Icon } = describe(finding);

            return (
              <ItemRow
                key={`${finding.code}-${finding.port}-${index}`}
                className="border-x-0 border-b-0 p-6"
                icon={
                  <Icon
                    aria-hidden="true"
                    className={cn("size-5", SEVERITY_STYLES[finding.severity])}
                  />
                }
                rightSide={
                  finding.suggested_rule ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => setSuggested(finding)}
                    >
                      {t("Create rule")}
                    </Button>
                  ) : finding.code === "ORPHAN_RULE" &&
                    finding.host_rule_pos !== null ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={isDeletePending}
                      onClick={() =>
                        deleteRule({
                          server_id: serverId,
                          // Checked above; narrowing does not survive the arrow.
                          pos: finding.host_rule_pos as number,
                        })
                      }
                    >
                      {isDeletePending ? (
                        <Spinner />
                      ) : (
                        <LucideTrash2 aria-hidden="true" />
                      )}
                      {t("Remove rule")}
                    </Button>
                  ) : null
                }
              >
                <p className="wrap-break-word font-medium text-sm">{title}</p>
                <p className="text-pretty text-muted-foreground text-sm leading-snug">
                  {description}
                </p>
              </ItemRow>
            );
          })}
        </CardContent>
      </Card>
      {suggested?.suggested_rule && (
        <FirewallRuleDialog
          mode="create"
          open
          onOpenChange={(open) => setSuggested(open ? suggested : null)}
          defaultValues={{
            // Position zero on purpose: rules are evaluated top down and the
            // first match wins, so a rule meant to block has to come first.
            pos: 0,
            enabled: true,
            direction: suggested.suggested_rule.direction,
            action: suggested.suggested_rule.action,
            proto: suggested.suggested_rule.proto,
            dport: suggested.suggested_rule.dport,
            comment: suggested.service ?? undefined,
          }}
        />
      )}
    </ClientOnly>
  );
}
