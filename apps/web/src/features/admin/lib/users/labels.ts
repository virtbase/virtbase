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

import { CrownIcon, UserIcon } from "@virtbase/ui/icons";

export function getRoleIcon(role: "CUSTOMER" | "ADMIN") {
  const roleIcons = {
    CUSTOMER: UserIcon,
    ADMIN: CrownIcon,
  } satisfies Record<"CUSTOMER" | "ADMIN", React.ElementType>;

  return roleIcons[role];
}

export function getRoleLabel(role: "CUSTOMER" | "ADMIN") {
  const roleLabels = {
    CUSTOMER: "Customer",
    ADMIN: "Admin",
  } satisfies Record<"CUSTOMER" | "ADMIN", string>;

  return roleLabels[role];
}
