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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { LucideChevronRight } from "@virtbase/ui/icons";
import NextLink from "next/link";
import { useExtracted, useFormatter, useNow } from "next-intl";
import {
  isActive,
  needsAnswer,
  useAbuseCases,
} from "@/features/abuse/hooks/use-abuse-cases";
import { useCaseLabels } from "@/features/abuse/hooks/use-case-labels";
import { paths } from "@/lib/paths";
import { STATUS_ICONS } from "@/ui/abuse/case-meta";

/** How many fit before the card stops being a summary. */
const SHOWN = 3;

export function ActiveAbuseCases() {
  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const labels = useCaseLabels();

  const { data } = useAbuseCases();

  const active = data.cases.filter(isActive);
  if (0 === active.length) return null;

  // Whatever needs the customer first, then whatever is most recent.
  const ordered = [...active].sort((a, b) => {
    if (needsAnswer(a) !== needsAnswer(b)) return needsAnswer(a) ? -1 : 1;
    return b.created_at.getTime() - a.created_at.getTime();
  });

  const waiting = active.filter(needsAnswer).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Abuse reports")}</CardTitle>
        <CardDescription>
          {waiting > 0
            ? t(
                "{count, plural, one {# report is waiting on your answer.} other {# reports are waiting on your answer.}}",
                { count: waiting },
              )
            : t("Open reports about your servers.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="divide-y">
          {ordered.slice(0, SHOWN).map((abuseCase) => {
            const Status = STATUS_ICONS[abuseCase.status];
            const deadline = abuseCase.respond_by;
            const overdue = Boolean(
              deadline && deadline.getTime() < now.getTime(),
            );

            return (
              <div
                key={abuseCase.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <NextLink
                    href={paths.app.abuseCase.getHref(abuseCase.id)}
                    prefetch={false}
                    className="truncate font-medium text-sm outline-none transition-colors hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {abuseCase.title}
                  </NextLink>
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Status aria-hidden="true" className="size-3 shrink-0" />
                    {labels.status[abuseCase.status]}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {deadline ? (
                    <Badge
                      variant={overdue ? "destructive" : "outline"}
                      suppressHydrationWarning
                    >
                      {overdue
                        ? t("Answer overdue")
                        : t("Answer by {when}", {
                            when: format.relativeTime(deadline, now),
                          })}
                    </Badge>
                  ) : null}
                  <NextLink
                    href={paths.app.abuseCase.getHref(abuseCase.id)}
                    prefetch={false}
                    className="outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    aria-label={t("View case")}
                  >
                    <LucideChevronRight
                      aria-hidden="true"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    />
                  </NextLink>
                </div>
              </div>
            );
          })}
        </div>

        {active.length > SHOWN ? (
          <Button variant="outline" asChild className="self-start">
            <NextLink href={paths.app.abuse.getHref()} prefetch={false}>
              {t(
                "{count, plural, one {# more report} other {# more reports}}",
                {
                  count: active.length - SHOWN,
                },
              )}
            </NextLink>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
