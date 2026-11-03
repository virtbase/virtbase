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

import { LucideAlignLeft } from "@virtbase/ui/icons";
import type { TOCItemType } from "fumadocs-core/toc";
import { AnchorProvider, ScrollProvider, TOCItem } from "fumadocs-core/toc";
import { useExtracted } from "next-intl";
import { useRef } from "react";

export function TableOfContents({
  items,
  maxDepth = Number.POSITIVE_INFINITY,
}: {
  items: TOCItemType[];
  maxDepth?: number;
}) {
  const t = useExtracted();
  const viewRef = useRef<HTMLDivElement>(null);
  const shown = items.filter((item) => item.depth <= maxDepth);

  if (shown.length === 0) return null;

  return (
    <div>
      <p className="-ml-0.5 flex items-center gap-1.5 text-muted-foreground text-sm">
        <LucideAlignLeft className="size-4" />
        {t("On this page")}
      </p>
      <AnchorProvider toc={shown} single={true}>
        <div
          ref={viewRef}
          className="mt-4 max-h-[calc(100vh-9rem)] overflow-y-auto overflow-x-hidden overscroll-contain"
        >
          <div className="grid gap-4 border-muted border-l-2">
            <ScrollProvider containerRef={viewRef}>
              {shown.map((item) => (
                <TOCItem
                  key={item.url}
                  href={item.url}
                  className="group relative -ml-0.5"
                  style={{ paddingLeft: `${16 + (item.depth - 2) * 8}px` }}
                >
                  <p className="hyphens-auto break-words text-muted-foreground text-sm transition-colors hover:text-foreground group-data-[active=true]:text-foreground">
                    {item.title}
                  </p>
                  <div className="absolute top-0 left-0 h-full w-0.5 origin-top scale-y-0 transform-none bg-muted-foreground group-data-[active=true]:scale-y-100" />
                </TOCItem>
              ))}
            </ScrollProvider>
          </div>
        </div>
      </AnchorProvider>
    </div>
  );
}
