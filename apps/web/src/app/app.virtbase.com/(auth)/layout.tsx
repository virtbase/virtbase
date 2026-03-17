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
import { Grid } from "@virtbase/ui/grid";
import { Logo } from "@virtbase/ui/logo";
import { APP_NAME, PUBLIC_DOMAIN } from "@virtbase/utils";
import { DefaultJsonLd } from "@/ui/seo/default-json-ld";

export default function Layout({ children }: LayoutProps<"/app.virtbase.com">) {
  return (
    <>
      <div className="absolute inset-0 isolate overflow-hidden bg-background">
        {/* Grid */}
        <div
          className={cn(
            "absolute inset-y-0 left-1/2 w-[1200px] -translate-x-1/2",
            "mask-intersect mask-[linear-gradient(black,transparent_320px),linear-gradient(90deg,transparent,black_5%,black_95%,transparent)]",
          )}
          aria-hidden="true"
        >
          <Grid cellSize={60} patternOffset={[0.75, 0]} />
        </div>

        {/* Gradient */}
        {[...Array(2)].map((_, idx) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: idx is unique
            key={idx}
            className={cn(
              "absolute top-6 left-1/2 size-[80px] -translate-x-1/2 -translate-y-1/2 scale-x-[1.6]",
              idx === 0 ? "mix-blend-overlay" : "opacity-10",
            )}
            aria-hidden="true"
          >
            {[...Array(idx === 0 ? 2 : 1)].map((_, idx) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: idx is unique
                key={idx}
                className={cn(
                  "absolute -inset-16 mix-blend-overlay blur-[50px] saturate-[2]",
                  "bg-[conic-gradient(from_90deg,#F00_5deg,#EAB308_63deg,#5CFF80_115deg,#1E00FF_170deg,#855AFC_220deg,#3A8BFD_286deg,#F00_360deg)]",
                )}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="relative flex min-h-screen w-full justify-center">
        <a
          data-testid="logo-link"
          href={PUBLIC_DOMAIN}
          className="absolute top-4 left-1/2 z-10 -translate-x-1/2"
          rel="noopener noreferrer"
        >
          <Logo className="h-8" />
          <span className="sr-only">{APP_NAME}</span>
        </a>
        {children}
      </div>
      <DefaultJsonLd />
    </>
  );
}
