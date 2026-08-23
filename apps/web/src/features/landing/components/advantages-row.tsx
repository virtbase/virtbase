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

import type { ReactNode } from "react";

/**
 * A four-across band of `<Advantage>` blocks. The `gap-px` over a border
 * background is what draws the hairlines between cells.
 */
export function AdvantagesRow({ children }: { children?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-px bg-border text-sm sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}
