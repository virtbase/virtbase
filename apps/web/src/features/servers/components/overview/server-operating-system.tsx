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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@virtbase/ui/tooltip";
import { resolveOperatingSystem } from "@virtbase/utils";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";
import type { GetServerOutput } from "../../hooks/use-server";

type Server = GetServerOutput["server"];

const packageName = "qemu-guest-agent";

/**
 * The operating system a server is running, as shown on the overview.
 *
 * Two things are worth saying here and nowhere else. The first is what the
 * server actually runs, which is read out of the guest and is not necessarily
 * what it was installed with. The second is what it *was* installed with,
 * which only earns its place when the two disagree - that is the case where a
 * customer would otherwise wonder why the name changed, and the case a support
 * conversation needs in order to make sense of the server.
 */
export function ServerOperatingSystem({ server }: { server: Server }) {
  const t = useExtracted();
  const format = useFormatter();
  // Passed explicitly, as everywhere else that formats a relative time: an
  // implicit `now` differs between the server and the client render.
  const now = useNow({ updateInterval: 60_000 });

  const os = server.operating_system;
  const template = typeof server.template === "object" ? server.template : null;

  if (os.source === "unknown" || !os.name) {
    return <span className="truncate">-</span>;
  }

  const detected = os.source === "detected";

  // Compared by catalog slug rather than by name: "Debian GNU/Linux 13
  // (trixie)" detected against a "Debian 13" template is not a disagreement,
  // and saying so would be noise on every correctly-provisioned server.
  const templateSlug = template
    ? resolveOperatingSystem({ text: [template.name, template.icon] })?.slug
    : null;

  const installedFrom =
    detected && template?.name && templateSlug !== os.slug
      ? template.name
      : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          className="flex min-w-0 cursor-default items-center gap-2 text-left"
        >
          <OperatingSystemIcon icon={os.icon} />
          <span className="truncate">{os.name}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs px-4 py-2 text-sm">
          {detected ? (
            <>
              <p>
                {os.detected_at
                  ? t("Read from inside this server {when}.", {
                      when: format.relativeTime(os.detected_at, now),
                    })
                  : t("Read from inside this server.")}
              </p>
              {installedFrom ? (
                <p className="mt-1 text-muted text-xs">
                  {t("Installed from {template}.", { template: installedFrom })}
                </p>
              ) : null}
            </>
          ) : os.source === "iso" ? (
            <p>
              {t(
                "Taken from the mounted image. Install the {packageName} package to have Virtbase read the operating system from inside the server.",
                { packageName },
              )}
            </p>
          ) : (
            <p>
              {t(
                "Taken from the template this server was created from. Install the {packageName} package to have Virtbase read the operating system from inside the server.",
                { packageName },
              )}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
