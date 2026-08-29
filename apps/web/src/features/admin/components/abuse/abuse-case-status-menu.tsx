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

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  LucideBan,
  LucideCircleCheck,
  LucideCircleDot,
  LucideCircleSlash,
  LucideMapPinOff,
  LucideShieldCheck,
  LucideThumbsUp,
  LucideTrash2,
  LucideUserRoundCheck,
} from "@virtbase/ui/icons";
import { InputGroupButton } from "@virtbase/ui/input-group";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { humanise, STATUS_ICONS } from "@/ui/abuse/case-meta";
import type { AbuseCaseDetail } from "../../api/abuse/get-abuse-cases";
import { setAbuseCaseStatusAction } from "../../api/abuse/manage-abuse-cases";

type Status = AbuseCaseDetail["status"];
type Resolution = NonNullable<AbuseCaseDetail["resolution"]>;

/**
 * The statuses somebody moves a case through by hand, each with the key that
 * picks it.
 *
 * The letters are the first distinctive one of each word, which is what makes
 * them learnable without a legend.
 */
const OPEN_STATUSES: {
  status: Status;
  key: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { status: "triage", key: "t", icon: STATUS_ICONS.triage },
  { status: "open", key: "o", icon: STATUS_ICONS.open },
  {
    status: "awaiting_customer",
    key: "c",
    icon: STATUS_ICONS.awaiting_customer,
  },
  {
    status: "awaiting_operator",
    key: "p",
    icon: STATUS_ICONS.awaiting_operator,
  },
  { status: "mitigated", key: "m", icon: STATUS_ICONS.mitigated },
];

/**
 * Why a case closed, split by which ending it belongs to.
 *
 * Behind submenus rather than a second dialog step: closing is one decision
 * with two halves, and asking for them one after another turns the common
 * case - "fixed, done" - into three clicks.
 */
const RESOLVED_REASONS: {
  resolution: Resolution;
  key: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { resolution: "fixed_by_customer", key: "f", icon: LucideUserRoundCheck },
  { resolution: "mitigated_by_operator", key: "m", icon: LucideShieldCheck },
  { resolution: "terminated", key: "t", icon: LucideTrash2 },
  { resolution: "no_response", key: "n", icon: LucideCircleSlash },
];

const REJECTED_REASONS: {
  resolution: Resolution;
  key: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { resolution: "false_positive", key: "p", icon: LucideThumbsUp },
  { resolution: "not_our_range", key: "r", icon: LucideMapPinOff },
];

/** A settled case is settled. Reopening one is not a status change. */
const TERMINAL: Status[] = ["resolved", "rejected"];

export function AbuseCaseStatusMenu({
  abuseCase,
}: {
  abuseCase: AbuseCaseDetail;
}) {
  const t = useExtracted();

  // No success toast: the badge on this button and the aside both change.
  const move = useAction(setAbuseCaseStatusAction, {
    onError: ({ error }) =>
      toast.error(error.serverError ?? t("Something went wrong.")),
  });

  const settled = TERMINAL.includes(abuseCase.status);

  // Only where the case can actually go. An option that would be refused by
  // the server is not a choice, and showing it greyed out just asks the reader
  // to work out why.
  const available = OPEN_STATUSES.filter(
    (entry) => entry.status !== abuseCase.status,
  );

  const setStatus = (status: Status, resolution?: Resolution) =>
    move.execute({
      caseId: abuseCase.id,
      status,
      ...(resolution ? { resolution } : {}),
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <InputGroupButton
          variant="outline"
          size="sm"
          disabled={move.isPending || settled}
        >
          {move.isPending ? (
            <Spinner />
          ) : settled ? (
            <LucideCircleCheck aria-hidden="true" />
          ) : (
            <LucideCircleDot aria-hidden="true" />
          )}
          {humanise(abuseCase.status)}
        </InputGroupButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-60"
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return;

          const key = event.key.toLowerCase();
          const status = available.find((entry) => key === entry.key);

          if (status) {
            event.preventDefault();
            setStatus(status.status);
          }
        }}
      >
        <DropdownMenuLabel>{t("Move this case to")}</DropdownMenuLabel>

        {available.map(({ status, key, icon: Icon }) => (
          <DropdownMenuItem key={status} onSelect={() => setStatus(status)}>
            <Icon />
            {humanise(status)}
            <DropdownMenuShortcut>{key.toUpperCase()}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* Closing needs a reason, so the reasons are the menu. Picking one
            both closes the case and says why, in a single click. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <LucideCircleCheck />
            {t("Resolve as…")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="w-56"
            onKeyDown={(event) => {
              if (event.metaKey || event.ctrlKey || event.altKey) return;

              const key = event.key.toLowerCase();
              const reason = RESOLVED_REASONS.find(
                (entry) => key === entry.key,
              );

              if (reason) {
                event.preventDefault();
                setStatus("resolved", reason.resolution);
              }
            }}
          >
            {RESOLVED_REASONS.map(({ resolution, key, icon: Icon }) => (
              <DropdownMenuItem
                key={resolution}
                onSelect={() => setStatus("resolved", resolution)}
              >
                <Icon />
                {humanise(resolution)}
                <DropdownMenuShortcut>{key.toUpperCase()}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <LucideBan />
            {t("Reject as…")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="w-56"
            onKeyDown={(event) => {
              if (event.metaKey || event.ctrlKey || event.altKey) return;

              const key = event.key.toLowerCase();
              const reason = REJECTED_REASONS.find(
                (entry) => key === entry.key,
              );

              if (reason) {
                event.preventDefault();
                setStatus("rejected", reason.resolution);
              }
            }}
          >
            {REJECTED_REASONS.map(({ resolution, key, icon: Icon }) => (
              <DropdownMenuItem
                key={resolution}
                onSelect={() => setStatus("rejected", resolution)}
              >
                <Icon />
                {humanise(resolution)}
                <DropdownMenuShortcut>{key.toUpperCase()}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
