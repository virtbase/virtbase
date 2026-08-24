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
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import {
  LucidePlus,
  LucideRefreshCw,
  LucideSparkles,
} from "@virtbase/ui/icons/index";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useFirewallRules } from "../hooks/use-firewall-rules";
import { useGuestFirewall } from "../hooks/use-guest-firewall";
import { CreateFirewallRuleButton } from "./create-firewall-rule-button";
import { FirewallRulesTable } from "./firewall-rules-table";
import { GenerateFirewallRulesButton } from "./generate-firewall-rules-button";

export function FirewallRulesCard() {
  const t = useExtracted();

  const { id: serverId } = useParams<{ id: string }>();
  const { data, isPending, isRefetching, refetch } = useFirewallRules({
    server_id: serverId,
  });

  // Loaded alongside rather than awaited: inspecting the guest runs commands
  // inside the customer's server and can take a moment, and the Virtbase rules
  // must never wait on it.
  const { data: guest } = useGuestFirewall({ server_id: serverId });

  const guestRules = guest?.guest.status === "ok" ? guest.guest.rules : [];
  const guestManager = guest?.guest.primary;

  const isBusy = isRefetching || isPending;

  return (
    <Card className="gap-0 overflow-hidden pb-0">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{t("Firewall Rules")}</CardTitle>
          <div className="flex items-center gap-2">
            <CreateFirewallRuleButton disabled={isBusy}>
              <LucidePlus aria-hidden="true" />
            </CreateFirewallRuleButton>
            <GenerateFirewallRulesButton disabled={isBusy}>
              <LucideSparkles aria-hidden="true" />
            </GenerateFirewallRulesButton>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isBusy}
            >
              <LucideRefreshCw
                className={cn(isBusy && "animate-spin")}
                aria-hidden="true"
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <FirewallRulesTable
          hostRules={data?.rules}
          guestRules={guestRules}
          guestManager={guestManager}
          isPending={isPending}
        />
      </CardContent>
      <CardFooter className="border-t [.border-t]:py-4">
        <div className="flex flex-wrap items-center gap-2">
          {isPending || !data?.rules ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <span className="text-muted-foreground text-sm">
              {t(
                "{count, plural, =1 {# rule} other {# rules}}, {activeCount} active",
                {
                  count: data.rules.length,
                  activeCount: String(
                    data.rules.filter((rule) => rule.enabled).length,
                  ),
                },
              )}
              {guestRules.length > 0 &&
                ` · ${t(
                  "{count, plural, =1 {# rule} other {# rules}} inside your server",
                  { count: guestRules.length },
                )}`}
            </span>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
