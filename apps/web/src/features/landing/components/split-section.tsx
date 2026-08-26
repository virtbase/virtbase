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
import type { ReactNode } from "react";

import { Prose } from "@/ui/prose";

/**
 * An explanation beside the thing it explains.
 *
 * Every other block on a marketing page is a full-width band, so a page built
 * only from them reads as one column of stacked stripes however good the copy
 * is. This is the one block that puts two things side by side — prose against a
 * code sample or an image — which is what a page about an interface needs, and
 * what breaks the stripe rhythm.
 *
 * The two halves are child components rather than a `children` and an `aside`
 * prop, because a fenced code block cannot be written inside a JSX attribute.
 * The heading is written as ordinary Markdown inside `<SplitText>` so it
 * anchors and joins the document outline like every other `h2`:
 *
 * ```mdx
 * <Split>
 *   <SplitText>## Authenticate\n\nProse, links, lists.</SplitText>
 *   <SplitAside>```bash …```</SplitAside>
 * </Split>
 * ```
 */
export function SplitSection({
  reverse = false,
  children,
}: {
  /** Put the aside on the left. Alternate it down a page with several splits. */
  reverse?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      data-reverse={reverse ? "true" : undefined}
      className={cn(
        "mx-auto grid w-full max-w-5xl gap-8 px-4 py-12 sm:py-16",
        "lg:grid-cols-2 lg:items-start lg:gap-12",
        // Flipping the halves is presentation, so it happens here rather than
        // by asking authors to reorder the source.
        "data-[reverse=true]:[&>*:first-child]:lg:order-2",
        "data-[reverse=true]:[&>*:last-child]:lg:order-1",
      )}
    >
      {children}
    </div>
  );
}

/**
 * The prose half of a `<Split>`. Its first heading should be an `h2`, which
 * keeps the page outline correct when several splits follow each other.
 */
export function SplitText({ children }: { children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <Prose>{children}</Prose>
    </div>
  );
}

/**
 * The panel half of a `<Split>` — usually a fenced code block, which Fumadocs
 * has already rendered as a bordered figure by the time it arrives here.
 * `min-w-0` stops a long unwrapped line widening the grid track past its share.
 */
export function SplitAside({ children }: { children?: ReactNode }) {
  return (
    <div className="min-w-0 lg:sticky lg:top-24 [&_pre]:max-h-112">
      {children}
    </div>
  );
}
