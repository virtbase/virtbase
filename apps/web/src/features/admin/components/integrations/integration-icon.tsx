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
import NextImage from "next/image";

export function IntegrationIcon({
  icon,
  className,
  ...rest
}: React.ComponentProps<"div"> & {
  icon: string | null;
}) {
  return (
    <div
      className={cn("relative size-8 shrink-0 rounded-md", className)}
      {...rest}
    >
      {icon ? (
        <NextImage
          src={`/assets/static/integrations/${icon}.svg`}
          alt={icon ?? ""}
          width={32}
          height={32}
          className="relative size-full rounded-[inherit] blur-0"
        />
      ) : (
        <div className="relative size-full rounded-[inherit] border border-border/7.5" />
      )}
      <div className="pointer-events-none absolute inset-0 size-full rounded-[inherit] border border-border/7.5" />
    </div>
  );
}
