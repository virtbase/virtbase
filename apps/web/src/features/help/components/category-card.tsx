/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

"use client";

import { Grid } from "@virtbase/ui/grid";
import type { ReactNode } from "react";
import { IntlLink } from "@/i18n/navigation.public.ts";

/**
 * A help category on the help center's index. On hover a glow follows the
 * pointer across the card - the pointer position is written to CSS variables,
 * so the glow costs no re-render.
 */
export function CategoryCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  /** A rendered icon. A component could not cross into a client component. */
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      className="group relative isolate flex rounded-xl bg-background transition-shadow has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50"
      onPointerMove={(event) => {
        const { left, top } = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty(
          "--x",
          `${event.clientX - left}px`,
        );
        event.currentTarget.style.setProperty(
          "--y",
          `${event.clientY - top}px`,
        );
      }}
    >
      <div
        aria-hidden="true"
        className="mask-[linear-gradient(white,transparent)] absolute inset-0 overflow-hidden rounded-xl transition duration-300 group-hover:opacity-50"
      >
        <Grid
          cellSize={28}
          patternOffset={[14, 0]}
          className="inset-x-0 inset-y-[-30%] h-[160%] skew-y-[-18deg] text-foreground/5"
        />
      </div>
      <div
        aria-hidden="true"
        className="mask-[radial-gradient(180px_at_var(--x)_var(--y),white,transparent)] absolute inset-0 rounded-xl bg-linear-to-r from-primary/15 to-primary/5 opacity-0 transition duration-300 group-hover:opacity-100"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-xl ring-1 ring-border ring-inset group-hover:ring-foreground/10 group-has-[a:focus-visible]:ring-ring"
      />
      <div className="relative p-6 pt-16">
        <div className="text-muted-foreground [&_svg]:size-6">{icon}</div>
        <h3 className="mt-4 font-semibold text-foreground leading-7">
          {/* The link is the title, stretched over the card by the span. Its
              focus ring is drawn by the card, around the whole of it. */}
          <IntlLink href={href} prefetch={false} className="outline-none">
            <span className="absolute inset-0 rounded-xl" />
            {title}
          </IntlLink>
        </h3>
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}
