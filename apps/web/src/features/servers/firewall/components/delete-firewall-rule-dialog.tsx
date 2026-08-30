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

import { Button } from "@virtbase/ui/button";
import { useIsMobile } from "@virtbase/ui/hooks";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useDeleteFirewallRule } from "../hooks/use-delete-firewall-rule";
import { useFirewallActionMapping } from "../hooks/use-firewall-action-mapping";
import { useFirewallDirectionMapping } from "../hooks/use-firewall-direction-mapping";
import type { HostFirewallRow } from "../lib/table-rows";

interface DeleteFirewallRuleDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  > {
  hostRow: HostFirewallRow;
}

/**
 * The confirmation in front of dropping a rule off the Virtbase firewall.
 *
 * A deleted rule is not recoverable, and the one being deleted is identified
 * only by its place in a list that shifts under it - so the dialog repeats the
 * rule back before the customer commits to it.
 */
export default function DeleteFirewallRuleDialog({
  hostRow,
  ...props
}: DeleteFirewallRuleDialogProps) {
  const t = useExtracted();
  const isMobile = useIsMobile();
  const directionMapping = useFirewallDirectionMapping();
  const actionMapping = useFirewallActionMapping();

  const { id: serverId } = useParams<{ id: string }>();

  const { mutate, isPending } = useDeleteFirewallRule({
    mutationConfig: {
      onSuccess: () => {
        props.onOpenChange?.(false);
      },
    },
  });

  const action = t("Delete firewall rule");

  const direction = hostRow.direction
    ? directionMapping[hostRow.direction].label
    : "-";
  const ruleAction = hostRow.action ? actionMapping[hostRow.action].label : "-";

  return (
    <ResponsiveDialog
      title={action}
      description={t("Delete a rule from your firewall.")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              props.onOpenChange?.(false);
            }}
            disabled={isPending}
            autoFocus={!isMobile}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            variant="destructive"
            onClick={() => mutate({ server_id: serverId, pos: hostRow.pos })}
            disabled={isPending}
          >
            {isPending && <Spinner />} {action}
          </Button>
        </>
      }
      {...props}
    >
      <div className="flex flex-col gap-6">
        <p>
          {t(
            "Rule {position} will be removed from the Virtbase firewall. This cannot be undone.",
            { position: String(hostRow.pos + 1) },
          )}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("Direction")}</dt>
          <dd className="truncate">{direction}</dd>
          <dt className="text-muted-foreground">{t("Action")}</dt>
          <dd className="truncate">{ruleAction}</dd>
          <dt className="text-muted-foreground">{t("Protocol")}</dt>
          <dd className="truncate">{hostRow.proto || "*"}</dd>
          <dt className="text-muted-foreground">{t("Port")}</dt>
          <dd className="truncate">{hostRow.dport || "*"}</dd>
          <dt className="text-muted-foreground">{t("Source")}</dt>
          <dd className="truncate">{hostRow.source || "*"}</dd>
          {hostRow.comment ? (
            <>
              <dt className="text-muted-foreground">{t("Comment")}</dt>
              <dd className="truncate">{hostRow.comment}</dd>
            </>
          ) : null}
        </dl>
        <p>{t("Should the rule be deleted?")}</p>
      </div>
    </ResponsiveDialog>
  );
}
