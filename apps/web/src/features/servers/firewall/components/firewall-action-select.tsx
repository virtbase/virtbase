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

import {
  LucideCheckCircle,
  LucideClock,
  LucideXCircle,
} from "@virtbase/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@virtbase/ui/select";
import { useExtracted } from "next-intl";

export function ActionSelect(props: React.ComponentProps<typeof Select>) {
  const t = useExtracted();

  return (
    <Select {...props}>
      <SelectTrigger size="sm">
        <SelectValue placeholder={t("Select action")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ACCEPT">
          <LucideCheckCircle aria-hidden="true" />
          <span className="truncate">{t("Accept")}</span>
        </SelectItem>
        <SelectItem value="DROP">
          <LucideClock aria-hidden="true" />
          <span className="truncate">{t("Drop")}</span>
        </SelectItem>
        <SelectItem value="REJECT">
          <LucideXCircle aria-hidden="true" />
          <span className="truncate">{t("Reject")}</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
