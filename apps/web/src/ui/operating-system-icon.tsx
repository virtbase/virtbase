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
import { LucideDisc } from "@virtbase/ui/icons";
import NextImage from "next/image";

export const OperatingSystemIcon = ({
  icon,
  label,
  className,
}: {
  icon?: string | null;
  /**
   * The operating system's name, for assistive technology.
   *
   * Omit where the name is already rendered next to the logo - repeating it
   * makes a screen reader say it twice. Pass it where the logo stands alone,
   * as in the servers list, because there it is the only thing identifying the
   * operating system.
   */
  label?: string | null;
  className?: string;
}) => {
  if (icon) {
    return (
      <NextImage
        src={icon}
        alt={label ?? ""}
        width={20}
        height={20}
        unoptimized
        className={cn(
          "pointer-events-none size-5 shrink-0 select-none",
          className,
        )}
        {...(label ? {} : { "aria-hidden": true, role: "presentation" })}
      />
    );
  }
  // Fallback to a generic icon
  return (
    <LucideDisc
      strokeWidth={1.5}
      className={cn("size-5 shrink-0", className)}
      aria-hidden="true"
    />
  );
};
