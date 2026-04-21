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

export function BlockWrapper({
  children,
  variant = "default",
  width = "default",
  direction = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "hero" | "hero-full" | "default" | "flush";
  direction?: "default" | "reverse";
  width?: "default" | "full";
  className?: string;
}) {
  const base = "grid-section relative overflow-clip px-4";

  if (variant === "hero" || variant === "hero-full") {
    return (
      <div
        className={cn(
          base,
          "[.grid-section_~_&_>_div]:border-t-0",
          variant === "hero-full" && "border-b",
          width === "full" && "px-0",
        )}
      >
        <div
          className={cn(
            "relative z-0 mx-auto border-border",
            variant === "hero" && direction === "default" && "border-b",
            width === "default" && "max-w-5xl",
          )}
        >
          <div
            className="data-[direction=default]:mask-[linear-gradient(transparent,var(--background))] data-[direction=reverse]:mask-[linear-gradient(var(--background),transparent)] pointer-events-none absolute inset-0 border-border border-x"
            data-direction={direction}
            aria-hidden="true"
          />
          <div className={cn("relative", className)}>{children}</div>
        </div>
      </div>
    );
  }

  if (variant === "flush") {
    return <div className={cn("grid-section", className)}>{children}</div>;
  }

  // default: bordered section
  return (
    <div
      className={cn(
        base,
        "border-border border-y [.grid-section_~_&]:border-t-0",
        width === "full" && "px-0",
      )}
    >
      <div
        className={cn(
          "relative z-0 mx-auto border-border border-x",
          width === "default" && "max-w-5xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
