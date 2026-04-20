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
  LucideArrowLeftCircle,
  LucideArrowRightCircle,
} from "@virtbase/ui/icons";
import { useExtracted } from "next-intl";

export function useFirewallDirectionMapping() {
  const t = useExtracted();

  return {
    in: {
      label: t("Incoming"),
      icon: LucideArrowRightCircle,
    },
    out: {
      label: t("Outgoing"),
      icon: LucideArrowLeftCircle,
    },
  };
}
