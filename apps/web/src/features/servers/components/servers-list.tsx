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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@virtbase/ui/dropdown-menu";
import {
  LucideCheckCircle2,
  LucideClock,
  LucideCopy,
  LucideCpu,
  LucideEye,
  LucideHardDrive,
  LucideMemoryStick,
  LucideMoreVertical,
} from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import { formatBytes } from "@virtbase/utils";
import Link from "next/link";
import { useExtracted, useFormatter } from "next-intl";
import { toast } from "sonner";
import { EmptyServers } from "@/features/dashboard/components/empty-servers";
import { useServerList } from "@/features/dashboard/hooks/use-server-list";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { paths } from "@/lib/paths";
import { CopyButton } from "@/ui/copy-button";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";
import { ServerTerminatesBadge } from "./server-terminates-badge";

export function ServersList() {
  const t = useExtracted();
  const formatter = useFormatter();

  const { data: { servers } = {}, isPending } = useServerList();

  const [copiedIp, copyToClipboard] = useCopyToClipboard();

  if (isPending || !servers) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: index is unique
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
    );
  }

  if (!isPending && !servers.length) {
    return <EmptyServers />;
  }

  return (
    <ul className="flex flex-col gap-4">
      {servers.map((server) => {
        if (!server.plan || typeof server.plan !== "object") {
          // Never the case since the plan is always expanded
          return null;
        }

        return (
          <li
            key={server.id}
            className="rounded-xl border transition-[filter] data-[hover-state-enabled=true]:hover:drop-shadow-card-hover"
          >
            <div className="flex items-center gap-5 px-4 py-2.5 text-sm sm:gap-8 md:gap-12">
              <div className="min-w-0 grow">
                <div className="flex h-[60px] items-center gap-3 transition-[height]">
                  <OperatingSystemIcon className="size-9 rounded-full bg-muted p-2" />
                  <div className="h-[46px] min-w-0 overflow-hidden transition-[height]">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 shrink grow-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={paths.app.servers.overview.getHref(server.id)}
                            className="min-w-0 truncate font-semibold text-sm leading-6"
                            prefetch={false}
                          >
                            {server.name}
                          </Link>
                          <CopyButton value={server.name} />
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-3 whitespace-nowrap text-sm">
                      <div className="flex min-w-0 items-center gap-1">
                        <LucideCpu
                          aria-hidden="true"
                          className="size-3 shrink-0 text-muted-foreground"
                        />
                        <span className="truncate text-muted-foreground">
                          {t(
                            "{cores, plural, =0 {# vCores} =1 {# vCore} other {# vCores}}",
                            {
                              cores: server.plan.cores,
                            },
                          )}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <LucideMemoryStick
                          aria-hidden="true"
                          className="size-3 shrink-0 text-muted-foreground"
                        />
                        <span className="truncate text-muted-foreground">
                          {formatBytes(server.plan.memory * 1024 * 1024, {
                            formatter,
                          })}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <LucideHardDrive
                          aria-hidden="true"
                          className="size-3 shrink-0 text-muted-foreground"
                        />
                        <span className="truncate text-muted-foreground">
                          {formatBytes(
                            server.plan.storage * 1024 * 1024 * 1024,
                            {
                              formatter,
                            },
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="min-w-0 grow">
                  <ServerTerminatesBadge server={server} />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-lg">
                      <LucideMoreVertical aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link
                        href={paths.app.servers.overview.getHref(server.id)}
                        className="flex items-center gap-2"
                        prefetch={false}
                      >
                        <LucideEye aria-hidden="true" />
                        <span>{t("View")}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        // Don't close on click
                        e.preventDefault();

                        // TODO: Add IP to clipboard
                        toast.promise(copyToClipboard("127.0.0.1"), {
                          success: t("IP copied to clipboard!"),
                        });
                      }}
                    >
                      {copiedIp ? (
                        <LucideCheckCircle2 aria-hidden="true" />
                      ) : (
                        <LucideCopy aria-hidden="true" />
                      )}
                      <span>{t("Copy IP")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link
                        href={paths.app.servers.plan.getHref(server.id)}
                        className="flex items-center gap-2"
                        prefetch={false}
                      >
                        <LucideClock aria-hidden="true" />
                        <span>{t("Renew")}</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
