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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideCheck,
  LucideEye,
  LucideMoreVertical,
  LucideShieldCheck,
} from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import NextLink from "next/link";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { paths } from "@/lib/paths";
import {
  CATEGORY_ICONS,
  SEVERITY_ICONS,
  STATUS_ICONS,
} from "@/ui/abuse/case-meta";
import { GenericError } from "@/ui/generic-error";
import { useMarkAbuseCaseFixed } from "../hooks/use-abuse-actions";
import type { AbuseCaseSummary } from "../hooks/use-abuse-cases";
import { isActive, useAbuseCases } from "../hooks/use-abuse-cases";
import { useCaseLabels } from "../hooks/use-case-labels";

/** Statuses where claiming it is fixed still means something. */
const CAN_CLAIM_FIXED = new Set([
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
]);

export function AbuseCaseRow({ abuseCase }: { abuseCase: AbuseCaseSummary }) {
  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const labels = useCaseLabels();

  // No success toast: the status badge on this row changes, which says it.
  const markFixed = useMarkAbuseCaseFixed(abuseCase.id);

  const Status = STATUS_ICONS[abuseCase.status];
  const Severity = SEVERITY_ICONS[abuseCase.severity];
  const Category = CATEGORY_ICONS[abuseCase.category];

  const href = paths.app.abuseCase.getHref(abuseCase.id);
  const deadline = abuseCase.respond_by;
  const overdue = Boolean(deadline && deadline.getTime() < now.getTime());

  return (
    <li className="rounded-xl border transition-colors hover:border-foreground/20">
      <div className="flex items-center gap-4 px-4 py-3 text-sm sm:gap-6">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
          <Status aria-hidden="true" className="size-4.5" />
        </div>

        <div className="min-w-0 grow">
          <div className="flex min-w-0 items-center gap-2">
            <NextLink
              href={href}
              prefetch={false}
              className="min-w-0 truncate font-semibold leading-6"
            >
              {abuseCase.title}
            </NextLink>
            <span className="shrink-0 font-mono text-muted-foreground text-xs">
              {abuseCase.reference}
            </span>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-sm">
            <span className="flex items-center gap-1">
              <Category aria-hidden="true" className="size-3 shrink-0" />
              {labels.category[abuseCase.category]}
            </span>
            <span className="flex items-center gap-1">
              <Severity aria-hidden="true" className="size-3 shrink-0" />
              {labels.severity[abuseCase.severity]}
            </span>
            <span suppressHydrationWarning>
              {t("Opened {when}", {
                when: format.relativeTime(abuseCase.created_at, now),
              })}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {deadline ? (
            // The one fact worth colour on this row: a missed deadline is what
            // tightens enforcement, and it is the customer's to prevent.
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

          <Badge variant="outline" className="hidden sm:inline-flex">
            <Status aria-hidden="true" />
            {labels.status[abuseCase.status]}
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-lg">
                {markFixed.isPending ? (
                  <Spinner />
                ) : (
                  <LucideMoreVertical aria-hidden="true" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <NextLink href={href} prefetch={false}>
                  <LucideEye aria-hidden="true" />
                  <span>{t("View case")}</span>
                </NextLink>
              </DropdownMenuItem>

              {/* Hidden rather than disabled on a settled case: there is
                  nothing left to claim. */}
              {CAN_CLAIM_FIXED.has(abuseCase.status) ? (
                <DropdownMenuItem
                  disabled={markFixed.isPending}
                  onSelect={() =>
                    markFixed.mutate(
                      { id: abuseCase.id },
                      {
                        onError: (error) =>
                          toast.error(
                            error.message || t("Something went wrong."),
                          ),
                      },
                    )
                  }
                >
                  <LucideCheck aria-hidden="true" />
                  <span>{t("I fixed this")}</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

export function AbuseCasesList() {
  const t = useExtracted();
  const { data, isError, refetch } = useAbuseCases();

  const [showClosed, setShowClosed] = useState(false);

  if (isError) {
    return <GenericError className="border" reset={refetch} />;
  }

  const active = data.cases.filter(isActive);
  const closed = data.cases.filter((abuseCase) => !isActive(abuseCase));

  if (0 === data.cases.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideShieldCheck aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No abuse reports")}</EmptyTitle>
          <EmptyDescription>
            {t(
              "Nothing has been reported about your servers. If something is, you will find it here and hear from us by email.",
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {0 === active.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LucideShieldCheck aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("Nothing open")}</EmptyTitle>
            <EmptyDescription>
              {t("Every report about your servers has been settled.")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-4">
          {active.map((abuseCase) => (
            <AbuseCaseRow key={abuseCase.id} abuseCase={abuseCase} />
          ))}
        </ul>
      )}

      {closed.length > 0 ? (
        <>
          {showClosed ? (
            <ul className="flex flex-col gap-4 opacity-70">
              {closed.map((abuseCase) => (
                <AbuseCaseRow key={abuseCase.id} abuseCase={abuseCase} />
              ))}
            </ul>
          ) : null}

          <Button
            variant="ghost"
            className="self-center text-muted-foreground"
            onClick={() => setShowClosed((current) => !current)}
          >
            {showClosed
              ? t("Hide settled reports")
              : t(
                  "{count, plural, one {Show # settled report} other {Show # settled reports}}",
                  { count: closed.length },
                )}
          </Button>
        </>
      ) : null}
    </div>
  );
}
