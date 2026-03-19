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

export function ItemRow({
  rightSide,
  children,
  className,
  icon,
  ...props
}: React.ComponentProps<"div"> & {
  rightSide: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "-m-px overflow-hidden border bg-background p-6 first:rounded-t-md last:rounded-b-md",
        className,
      )}
      data-testid="item-row"
      {...props}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-4 truncate">
          {icon && (
            <div
              className="grid size-10 place-items-center rounded-full bg-muted p-2"
              data-testid="item-row-icon"
            >
              {icon}
            </div>
          )}
          <div
            className="flex flex-col gap-1 truncate"
            data-testid="item-row-content"
          >
            {children}
          </div>
        </div>
        {rightSide}
      </div>
    </div>
  );
}
