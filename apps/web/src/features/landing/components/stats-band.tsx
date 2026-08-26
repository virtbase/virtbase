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
 * A band of hard figures.
 *
 * Deliberately not another `<Advantages>`: that block argues, this one states.
 * Where an advantage is an icon and a sentence of prose, a stat is a number and
 * the word for what it counts, which reads at a glance and gives a long page a
 * different rhythm between two walls of text.
 *
 * Only for values that are actually true and actually checkable — a rate limit,
 * a licence, a count of something. A figure nobody can verify reads as filler
 * and costs more trust than the band buys.
 */
export function StatsBand({ children }: { children?: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
      {children}
    </div>
  );
}

/**
 * One cell of `<Stats>`: the figure, what it measures, and an optional line of
 * context underneath.
 */
export function StatItem({
  value,
  label,
  children,
}: {
  /** The figure itself. Kept short — it is set large and does not wrap well. */
  value: string;
  /** What the figure measures. */
  label: string;
  /** Optional clarifying line. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 bg-background p-5">
      <span className="font-mono font-semibold text-2xl text-foreground tabular-nums leading-none sm:text-3xl">
        {value}
      </span>
      <span className="font-medium text-foreground text-sm">{label}</span>
      {children && (
        <span className="text-muted-foreground text-sm">{children}</span>
      )}
    </div>
  );
}
