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

import { cn } from "@virtbase/ui";
import { LucideDisc3 } from "@virtbase/ui/icons";
import { findIsoCatalogEntry } from "@virtbase/utils";
import { OperatingSystemIcon } from "./operating-system-icon";

/**
 * The logo of the catalog entry an ISO download came from, falling back to the
 * generic disc used everywhere a custom image is listed.
 *
 * A customer-supplied URL matches nothing, and a catalog entry may have no logo
 * yet, so the fallback is the normal case rather than an error path.
 */
export function CustomImageIcon({
  url,
  className,
}: {
  url?: string;
  className?: string;
}) {
  const icon = url ? findIsoCatalogEntry(url)?.icon : null;

  if (!icon) {
    return (
      <LucideDisc3
        className={cn("size-5 shrink-0", className)}
        aria-hidden="true"
      />
    );
  }

  return <OperatingSystemIcon icon={icon} className={className} />;
}
