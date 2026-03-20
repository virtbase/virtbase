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

import type { createFormatter } from "next-intl";

type BaseFormatOptions<T extends readonly string[]> = {
  formatter: ReturnType<typeof createFormatter>;
  perSecond?: boolean;
  base?: 1024 | 1000;
  unit?: T[number];
};

function baseFormat<T extends readonly string[]>(units: T) {
  return (value: number, options: BaseFormatOptions<T>) => {
    const { formatter, perSecond = false, base = 1024, unit } = options;
    const unitIndex = unit
      ? units.indexOf(unit)
      : Math.max(
          0,
          Math.min(
            Math.floor(Math.log(value) / Math.log(base)),
            units.length - 1,
          ),
        );

    return formatter.number(value / base ** unitIndex, {
      style: "unit",
      unit: perSecond
        ? `${unit || units[unitIndex]}-per-second`
        : units[unitIndex],
      unitDisplay: "narrow",
      notation: "compact",
    });
  };
}

export const formatBytes = baseFormat([
  "byte",
  "kilobyte",
  "megabyte",
  "gigabyte",
  "terabyte",
  "petabyte",
]);

export const formatBits = baseFormat([
  "bit",
  "kilobit",
  "megabit",
  "gigabit",
  "terabit",
  "petabit",
]);
