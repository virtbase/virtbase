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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@virtbase/ui/select";
import { useExtracted } from "next-intl";
import { useFirewallActionMapping } from "../hooks/use-firewall-action-mapping";

interface FirewallActionSelectProps
  extends React.ComponentProps<typeof Select> {
  triggerProps?: React.ComponentProps<typeof SelectTrigger>;
}

export function FirewallActionSelect({
  triggerProps,
  ...props
}: FirewallActionSelectProps) {
  const t = useExtracted();
  const mapping = useFirewallActionMapping();

  return (
    <Select {...props}>
      <SelectTrigger {...triggerProps}>
        <SelectValue placeholder={t("Select action")} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(mapping).map(([value, { label, icon: Icon }]) => (
          <SelectItem key={value} value={value}>
            <Icon aria-hidden="true" />
            <span className="truncate">{label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
