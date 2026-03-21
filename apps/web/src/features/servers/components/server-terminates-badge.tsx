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

import { Badge } from "@virtbase/ui/badge";
import { LucideClock, LucideClockAlert } from "@virtbase/ui/icons";
import { isExpiring } from "@virtbase/utils";
import { useFormatter, useNow } from "next-intl";

export function ServerTerminatesBadge({
  server,
}: {
  server: {
    terminates_at: Date | null;
  };
}) {
  const formatter = useFormatter();
  const now = useNow({ updateInterval: 1000 });

  if (!server.terminates_at) {
    return null;
  }

  return (
    <Badge variant={!isExpiring(server) ? "secondary" : "destructive"}>
      {!isExpiring(server) ? (
        <LucideClock aria-hidden="true" />
      ) : (
        <LucideClockAlert aria-hidden="true" />
      )}
      {formatter.relativeTime(server.terminates_at, {
        now,
      })}
    </Badge>
  );
}
