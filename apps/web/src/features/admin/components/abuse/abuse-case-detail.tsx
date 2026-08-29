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
import { Separator } from "@virtbase/ui/separator";
import { Spinner } from "@virtbase/ui/spinner";
import NextLink from "next/link";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { paths } from "@/lib/paths";
import {
  CATEGORY_ICONS,
  ENFORCEMENT_ICONS,
  humanise,
  SEVERITY_ICONS,
  STATUS_ICONS,
} from "@/ui/abuse/case-meta";
import type { AbuseCaseDetail } from "../../api/abuse/get-abuse-cases";
import { enforceAbuseCaseAction } from "../../api/abuse/manage-abuse-cases";
import { AbuseCaseConversation } from "./abuse-case-conversation";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Everything about the case that is not somebody talking.
 *
 * An aside rather than a stack of cards above the thread: the conversation is
 * what an operator came for, and this is what they glance at while reading it.
 * No card chrome either - it is a margin note, not a second document.
 */
function CaseAside({ abuseCase }: { abuseCase: AbuseCaseDetail }) {
  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  // Decided but not yet applied: the grace window is what an operator skips.
  const pending =
    "none" !== abuseCase.enforcement && null === abuseCase.enforcedAt;

  const enforce = useAction(enforceAbuseCaseAction, {
    // The change happens on a hypervisor and the only thing that moves on
    // screen is a timestamp, so this one does need saying.
    onSuccess: ({ data }) =>
      toast.success(
        t("Locked {count} servers.", { count: String(data?.locked ?? 0) }),
      ),
    onError: ({ error }) =>
      toast.error(error.serverError ?? t("Something went wrong.")),
  });

  const Status = STATUS_ICONS[abuseCase.status];
  const Severity = SEVERITY_ICONS[abuseCase.severity];
  const Category = CATEGORY_ICONS[abuseCase.category];
  const Enforcement = ENFORCEMENT_ICONS[abuseCase.enforcement];

  return (
    <aside className="lg:scrollbar-none flex flex-col gap-6 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto lg:border-s lg:ps-6">
      {/* The title only. What was reported opens the thread instead, where it
          is read once and in order rather than glanced at beside it. */}
      <h2 className="font-medium text-base leading-6">{abuseCase.title}</h2>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">
          <Status aria-hidden="true" />
          {humanise(abuseCase.status)}
        </Badge>
        <Badge variant="outline">
          <Severity aria-hidden="true" />
          {abuseCase.severity}
        </Badge>
        <Badge variant="outline">
          <Category aria-hidden="true" />
          {humanise(abuseCase.category)}
        </Badge>
        {abuseCase.overdue ? (
          <Badge variant="destructive">{t("Overdue")}</Badge>
        ) : null}
        {abuseCase.staleAttribution ? (
          <Badge variant="destructive">{t("Stale attribution")}</Badge>
        ) : null}
        {"none" === abuseCase.enforcement ? null : (
          <Badge variant="outline">
            <Enforcement aria-hidden="true" />
            {humanise(abuseCase.enforcement)}
          </Badge>
        )}
        {abuseCase.blocksOrdering ? (
          <Badge variant="outline">{t("Orders blocked")}</Badge>
        ) : null}
      </div>

      <Separator />

      <dl className="flex flex-col gap-5">
        <Row label={t("Customer")}>
          {abuseCase.customer ? (
            <NextLink
              className="underline decoration-dotted underline-offset-4"
              href={paths.admin.users.overview.getHref(abuseCase.customer.id)}
            >
              {abuseCase.customer.email}
            </NextLink>
          ) : (
            // A case that arrived by email has none until somebody says whose
            // it is. That is what triage means.
            <span className="text-muted-foreground">
              {t("Not yet attributed")}
            </span>
          )}
        </Row>

        <Row label={t("Reported by")}>
          {abuseCase.contacts.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {abuseCase.contacts.map((contact) => (
                <li
                  key={contact.email}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {/* [!] Reporter-supplied, and operators only. */}
                  <span className="truncate">{contact.email}</span>
                  {contact.acknowledgedAt ? null : (
                    <Badge variant="outline">{t("Not acknowledged")}</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">
              {t("Nobody — this case was not opened by a report.")}
            </span>
          )}
        </Row>

        <Row label={t("Opened")}>
          <span suppressHydrationWarning>
            {format.dateTime(abuseCase.createdAt, {
              dateStyle: "short",
              timeStyle: "short",
            })}
            {" · "}
            {format.relativeTime(abuseCase.createdAt, now)}
          </span>
        </Row>

        {abuseCase.respondBy ? (
          <Row label={t("Customer due")}>
            <span suppressHydrationWarning>
              {format.relativeTime(abuseCase.respondBy, now)}
            </span>
          </Row>
        ) : null}

        {abuseCase.enforceAt && !abuseCase.enforcedAt ? (
          <Row label={t("Enforces")}>
            <span suppressHydrationWarning>
              {format.relativeTime(abuseCase.enforceAt, now)}
            </span>
          </Row>
        ) : null}

        {abuseCase.observeUntil ? (
          <Row label={t("Watched until")}>
            <span suppressHydrationWarning>
              {format.relativeTime(abuseCase.observeUntil, now)}
            </span>
          </Row>
        ) : null}

        <Row label={t("Affected servers")}>
          {abuseCase.servers.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {abuseCase.servers.map((server) => (
                <li key={server.serverId} className="flex items-center gap-2">
                  <span className="truncate">{server.serverName}</span>
                  {"none" === server.lockLevel ? null : (
                    <Badge variant="outline">
                      {humanise(server.lockLevel)}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">{t("None")}</span>
          )}
        </Row>

        {abuseCase.resolution ? (
          <Row label={t("Closed as")}>{humanise(abuseCase.resolution)}</Row>
        ) : null}
      </dl>

      <Separator />

      {pending ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm leading-6">
            {t(
              "This case applies {level} when the grace window closes. The window is the customer's chance to act first.",
              { level: humanise(abuseCase.enforcement) },
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={enforce.isPending}
            onClick={() => enforce.execute({ caseId: abuseCase.id })}
          >
            {enforce.isPending && <Spinner />} {t("Enforce now")}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm leading-6">
          {"none" === abuseCase.enforcement
            ? t("Nothing has been restricted on this case.")
            : t("{level} is in force.", {
                level: humanise(abuseCase.enforcement),
              })}
        </p>
      )}
    </aside>
  );
}

export function AbuseCaseDetailView({
  abuseCase,
}: {
  abuseCase: AbuseCaseDetail;
}) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <AbuseCaseConversation abuseCase={abuseCase} />
      <CaseAside abuseCase={abuseCase} />
    </div>
  );
}
