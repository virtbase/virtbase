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

import { LucideInfo } from "@virtbase/ui/icons";

export function HelpHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-start space-x-3 rounded-lg border border-border p-4 pr-8 text-[0.95rem]">
      <div className="mt-1 shrink-0">
        <LucideInfo
          className="size-5 text-muted-foreground"
          aria-hidden="true"
          strokeWidth={1.5}
        />
      </div>
      <div className="[&>p]:my-0">{children}</div>
    </div>
  );
}
